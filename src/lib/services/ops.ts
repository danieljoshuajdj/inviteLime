import { createAdminClient } from "@/lib/supabase/admin";

import { purgeGuestSessionFolders, purgeWedding } from "./wedding-purge";

export interface RateLimitOptions {
  bucket: string;
  key: string;
  limit: number;
  windowSeconds: number;
}

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

type UncheckedRpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

function rpc(client: ReturnType<typeof createAdminClient>): UncheckedRpc {
  return client.rpc as unknown as UncheckedRpc;
}

/**
 * Best-effort client identifier for rate limiting. Never used for anything
 * else and never stored beyond the counter window.
 */
export function clientKey(req: Request, fallback = "anonymous"): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    fallback
  );
}

/**
 * Fixed-window rate limit backed by the `consume_rate_limit` RPC.
 *
 * Fails open on purpose: if the database or the migration is unavailable we
 * would rather serve the request than take the whole platform down.
 */
export async function consumeRateLimit(
  options: RateLimitOptions
): Promise<{ allowed: boolean; degraded: boolean }> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await rpc(supabase)("consume_rate_limit", {
      p_bucket: options.bucket,
      p_key: options.key,
      p_limit: options.limit,
      p_window_seconds: options.windowSeconds,
    });
    if (error) return { allowed: true, degraded: true };
    return { allowed: data !== false, degraded: false };
  } catch {
    return { allowed: true, degraded: true };
  }
}

export interface MaintenanceResult {
  guestDrafts: number;
  guestSessions: number;
  expiredInvitations: number;
  /** Expired + cancelled invitations purged this run. */
  purgedInvitations: number;
  /** Unpaid checkout drafts purged this run. */
  purgedDraftWeddings: number;
  /** Guest sessions whose stored folders were removed this run. */
  purgedSessions: number;
  /** Storage objects removed across every purge this run. */
  purgedObjects: number;
  /** Purge attempts that failed; the next run retries them. */
  purgeFailures: number;
  degraded: boolean;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Non-negative integer env override, used for retention windows and batches. */
function envInt(name: string, fallback: number, min = 0): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < min) return fallback;
  return Math.floor(raw);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function daysAgoDate(days: number): string {
  return daysAgoIso(days).slice(0, 10);
}

/**
 * Purges invitations that have retired — expired or cancelled — so neither the
 * database nor object storage keeps them around. Batched, because each purge
 * does several storage round trips; the remaining backlog drains on later runs.
 */
async function purgeRetiredWeddings(admin: AdminClient, result: MaintenanceResult): Promise<void> {
  // Grace window in days before a retired invitation is purged (0 = on its
  // first run after the expiry day). Configurable so an operator can keep
  // recovery slack without a code change.
  const grace = envInt("RETENTION_PURGE_GRACE_DAYS", 0);
  const batch = envInt("PURGE_BATCH_SIZE", 10, 1);

  const ids = new Set<string>();

  const expired = await admin
    .from("weddings")
    .select("id")
    .eq("status", "expired")
    .lt("expiration_date", daysAgoDate(grace))
    .order("expiration_date", { ascending: true })
    .limit(batch);
  if (expired.error) {
    result.degraded = true;
  } else {
    for (const row of expired.data ?? []) ids.add(row.id);
  }

  const cancelled = await admin
    .from("weddings")
    .select("id")
    .eq("status", "cancelled")
    .lt("updated_at", daysAgoIso(grace))
    .order("updated_at", { ascending: true })
    .limit(batch);
  if (cancelled.error) {
    result.degraded = true;
  } else {
    for (const row of cancelled.data ?? []) ids.add(row.id);
  }

  for (const weddingId of ids) {
    try {
      const purged = await purgeWedding(admin, weddingId, {
        auditMetadata: { trigger: "retention" },
      });
      if (!purged.alreadyDeleted) {
        result.purgedInvitations += 1;
        result.purgedObjects += purged.objectsDeleted;
      }
    } catch (err) {
      result.purgeFailures += 1;
      console.warn("[maintenance] invitation purge failed", {
        weddingId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}

/**
 * Purges abandoned checkout drafts. A draft wedding is created before payment
 * and is invisible to customers once the guest session that created it lapses,
 * so an unpaid one only rots.
 */
async function purgeStaleDraftWeddings(admin: AdminClient, result: MaintenanceResult): Promise<void> {
  const retention = envInt("DRAFT_WEDDING_RETENTION_DAYS", 3);
  const batch = envInt("PURGE_BATCH_SIZE", 10, 1);

  const drafts = await admin
    .from("weddings")
    .select("id")
    .eq("status", "draft")
    .lt("created_at", daysAgoIso(retention))
    .order("created_at", { ascending: true })
    .limit(batch);
  if (drafts.error) {
    result.degraded = true;
    return;
  }
  const ids = (drafts.data ?? []).map((row) => row.id);
  if (ids.length === 0) return;

  // A slow webhook can still settle a payment after checkout; a draft that has
  // a paid or refunded order is a real purchase and must never be purged.
  const paid = await admin
    .from("orders")
    .select("wedding_id")
    .in("wedding_id", ids)
    .in("status", ["paid", "refunded"]);
  if (paid.error) {
    // Purging without knowing whether money changed hands is not acceptable.
    result.degraded = true;
    return;
  }
  const keep = new Set((paid.data ?? []).map((row) => row.wedding_id));

  for (const weddingId of ids) {
    if (keep.has(weddingId)) continue;
    try {
      const purged = await purgeWedding(admin, weddingId, {
        auditMetadata: { trigger: "retention", reason: "unpaid-draft" },
      });
      if (!purged.alreadyDeleted) {
        result.purgedDraftWeddings += 1;
        result.purgedObjects += purged.objectsDeleted;
      }
    } catch (err) {
      result.purgeFailures += 1;
      console.warn("[maintenance] draft purge failed", {
        weddingId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}

/**
 * Removes the stored objects of guest sessions that are about to be deleted by
 * `cleanup_expired_guest_data()`, while the tokens still exist — once the rows
 * are gone the token is lost and the draft uploads would be orphaned in the
 * bucket forever.
 *
 * Returns false when a purge could not be completed; the caller must then skip
 * the row cleanup so the sessions survive for a retry instead of orphaning
 * their files.
 */
async function purgeAbandonedSessionFolders(
  admin: AdminClient,
  result: MaintenanceResult
): Promise<boolean> {
  const batch = envInt("SESSION_PURGE_BATCH_SIZE", 50, 1);
  const nowIso = new Date().toISOString();

  const sessions = await admin
    .from("guest_sessions")
    .select("id, access_token")
    .lt("expires_at", nowIso)
    .limit(batch);
  if (sessions.error) {
    result.degraded = true;
    return false;
  }
  const rows = sessions.data ?? [];
  if (rows.length === 0) return true;
  const ids = rows.map((row) => row.id);

  // Mirror what the RPC will keep: a session survives while it has a live
  // draft or a paid/refunded order. A wedding still pinned to the session (a
  // draft within its own retention) protects it too, since that wedding's blob
  // may still point at these objects.
  const [liveDrafts, paidOrders, linkedWeddings] = await Promise.all([
    admin
      .from("guest_drafts")
      .select("session_id")
      .in("session_id", ids)
      .gt("expires_at", nowIso),
    admin
      .from("orders")
      .select("guest_session_id")
      .in("guest_session_id", ids)
      .in("status", ["paid", "refunded"]),
    admin.from("weddings").select("guest_session_id").in("guest_session_id", ids),
  ]);
  if (liveDrafts.error || paidOrders.error || linkedWeddings.error) {
    result.degraded = true;
    return false;
  }

  const keep = new Set<string>();
  for (const row of liveDrafts.data ?? []) keep.add(row.session_id);
  for (const row of paidOrders.data ?? []) {
    if (row.guest_session_id) keep.add(row.guest_session_id);
  }
  for (const row of linkedWeddings.data ?? []) {
    if (row.guest_session_id) keep.add(row.guest_session_id);
  }

  const tokens = rows.filter((row) => !keep.has(row.id)).map((row) => row.access_token);
  const purged = await purgeGuestSessionFolders(tokens);
  result.purgedSessions += purged.sessions;
  result.purgedObjects += purged.objectsDeleted;
  if (purged.failures > 0) {
    result.purgeFailures += purged.failures;
    return false;
  }
  return true;
}

/**
 * Periodic maintenance. Runs entirely from the cron endpoint and is idempotent:
 *
 *  1. expire invitations whose validity has passed;
 *  2. purge expired/cancelled invitations — rows AND stored media;
 *  3. purge unpaid checkout drafts older than the retention window;
 *  4. remove guest-session draft folders, then delete the draft/session rows;
 *  5. drop stale rate-limit counters.
 *
 * Order and payment history is never deleted: orders and payments keep their
 * rows with `wedding_id` set to NULL.
 */
export async function runMaintenance(): Promise<MaintenanceResult> {
  const supabase = createAdminClient();
  const result: MaintenanceResult = {
    guestDrafts: 0,
    guestSessions: 0,
    expiredInvitations: 0,
    purgedInvitations: 0,
    purgedDraftWeddings: 0,
    purgedSessions: 0,
    purgedObjects: 0,
    purgeFailures: 0,
    degraded: false,
  };

  // 1. Flip active → expired for invitations past their expiry day.
  const expired = await supabase.rpc("mark_expired_invitations");
  if (expired.error) {
    result.degraded = true;
  } else if (typeof expired.data === "number") {
    result.expiredInvitations = expired.data;
  }

  // 2 + 3. Purge retired invitations and abandoned checkout drafts.
  await purgeRetiredWeddings(supabase, result);
  await purgeStaleDraftWeddings(supabase, result);

  // 4. Session folders first, while the tokens that name them still exist.
  const sessionPurgeOk = await purgeAbandonedSessionFolders(supabase, result);

  // 5. Row-level retention: expired drafts/sessions and stale counters.
  if (sessionPurgeOk) {
    const cleanup = await rpc(supabase)("cleanup_expired_guest_data");
    if (cleanup.error) {
      result.degraded = true;
    } else if (cleanup.data && typeof cleanup.data === "object") {
      const row = cleanup.data as Record<string, unknown>;
      result.guestDrafts = Number(row.guest_drafts ?? 0);
      result.guestSessions = Number(row.guest_sessions ?? 0);
    }
  } else {
    // The session rows carry the only handle on their draft folders; deleting
    // them now would orphan those objects permanently.
    result.degraded = true;
  }

  return result;
}
