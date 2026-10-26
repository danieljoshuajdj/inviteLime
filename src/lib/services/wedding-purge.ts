import type { AdminClient } from "@/lib/supabase/admin";
import { guestFolderDigest } from "./media-access";
import { planWeddingObjectDeletion, mediaKeysInWeddingData } from "./invitation-deletion";
import { getObjectStorage, WEDDING_BUCKET } from "./storage";

/**
 * One permanent wedding removal, shared by every caller that deletes an
 * invitation: the admin delete action, the scheduled retention job (expired,
 * cancelled and abandoned-draft weddings) and, indirectly, the admin user
 * purge.
 *
 * Ordering is the safety property. Stored objects are removed BEFORE the row:
 * a failure part-way leaves orphaned files with the row still present, which a
 * retry can finish, rather than a renderable row pointing at media that no
 * longer exists. Conversely, `wedding_media` keys, the owning guest session's
 * token AND the keys referenced by `wedding_data` are all enumerated, so no
 * upload survives the purge just because it was never migrated to the wedding
 * folder.
 */

export interface WeddingPurgeOptions {
  /** Admin performing the purge, or null for scheduled retention. */
  actorId?: string | null;
  /** audit_logs action name. Defaults to the retention action. */
  auditAction?: string;
  /** Extra fields merged into the audit metadata (e.g. the trigger). */
  auditMetadata?: Record<string, unknown>;
}

export interface WeddingPurgeResult {
  alreadyDeleted: boolean;
  weddingId: string;
  slug: string | null;
  email: string | null;
  couple: string | null;
  previousStatus: string | null;
  objectsDeleted: number;
  prefixes: string[];
}

/**
 * Steps the purge can fail at. Carried on the error (rather than returned as a
 * union) so callers can map it straight onto an API response or a log line
 * while an unexpected throw still surfaces untouched.
 */
export type WeddingPurgeStep = "storage-list" | "storage-delete" | "database";

export class WeddingPurgeError extends Error {
  readonly step: WeddingPurgeStep;
  readonly objectsDeleted: number;
  readonly failures: Array<{ key: string; detail: string }>;

  constructor(
    step: WeddingPurgeStep,
    message: string,
    objectsDeleted = 0,
    failures: Array<{ key: string; detail: string }> = []
  ) {
    super(message);
    this.name = "WeddingPurgeError";
    this.step = step;
    this.objectsDeleted = objectsDeleted;
    this.failures = failures;
  }
}

/** Stop enumerating failures after this many; the response only needs a taste. */
const MAX_REPORTED_FAILURES = 5;

/**
 * Permanently removes a wedding: its stored objects (wedding folder, the
 * owning guest session's draft folders, recorded keys and any key still
 * referenced by `wedding_data`), then its dependent log rows, then the row
 * itself.
 *
 * `orders` and `payments` are deliberately kept: their `wedding_id` is set to
 * NULL by the foreign keys, so financial history survives the purge.
 * `wedding_media`, `wedding_events`, `rsvp_responses`, `invitation_views` and
 * `guest_list` cascade with the row.
 *
 * Idempotent: calling it for a wedding that is already gone is a no-op.
 */
export async function purgeWedding(
  admin: AdminClient,
  weddingId: string,
  options: WeddingPurgeOptions = {}
): Promise<WeddingPurgeResult> {
  const empty: WeddingPurgeResult = {
    alreadyDeleted: true,
    weddingId,
    slug: null,
    email: null,
    couple: null,
    previousStatus: null,
    objectsDeleted: 0,
    prefixes: [],
  };

  const { data: wedding, error: weddingError } = await admin
    .from("weddings")
    .select("id, slug, email, bride_name, groom_name, status, guest_session_id, wedding_data")
    .eq("id", weddingId)
    .maybeSingle();
  if (weddingError) throw new WeddingPurgeError("database", weddingError.message);
  if (!wedding) return empty;

  const { data: mediaRows } = await admin
    .from("wedding_media")
    .select("storage_key")
    .eq("wedding_id", weddingId);

  let guestToken: string | null = null;
  if (wedding.guest_session_id) {
    const { data: session } = await admin
      .from("guest_sessions")
      .select("access_token")
      .eq("id", wedding.guest_session_id)
      .maybeSingle();
    guestToken = session?.access_token ?? null;
  }

  // Three independent sources of objects, because none of them is complete on
  // its own: recorded rows, the session token (draft uploads), and the URLs
  // still embedded in the builder blob.
  const plan = planWeddingObjectDeletion({
    weddingId,
    guestAccessTokens: [guestToken],
    recordedKeys: [
      ...(mediaRows ?? []).map((row) => row.storage_key),
      ...mediaKeysInWeddingData(wedding.wedding_data),
    ],
  });

  const storage = await getObjectStorage();
  const keys = new Set<string>(plan.explicitKeys);
  try {
    for (const prefix of plan.prefixes) {
      for (const key of await storage.list(WEDDING_BUCKET, prefix)) {
        keys.add(key);
      }
    }
  } catch (err) {
    throw new WeddingPurgeError(
      "storage-list",
      err instanceof Error ? err.message : "storage error"
    );
  }

  let objectsDeleted = 0;
  const failures: Array<{ key: string; detail: string }> = [];
  for (const key of keys) {
    try {
      await storage.delete(WEDDING_BUCKET, key);
      objectsDeleted += 1;
    } catch (err) {
      failures.push({ key, detail: err instanceof Error ? err.message : "storage error" });
      if (failures.length >= MAX_REPORTED_FAILURES) break;
    }
  }
  if (failures.length > 0) {
    // Stop before touching any row so a retry can finish the cleanup.
    throw new WeddingPurgeError(
      "storage-delete",
      `${failures.length} stored file(s) could not be removed.`,
      objectsDeleted,
      failures
    );
  }

  // Operational logs are keyed to a wedding that is about to disappear; the
  // FKs would only null the link and leave anonymous rows behind.
  const emailDelete = await admin.from("email_deliveries").delete().eq("wedding_id", weddingId);
  if (emailDelete.error) {
    throw new WeddingPurgeError("database", emailDelete.error.message, objectsDeleted);
  }
  const analyticsDelete = await admin.from("analytics_events").delete().eq("wedding_id", weddingId);
  if (analyticsDelete.error) {
    throw new WeddingPurgeError("database", analyticsDelete.error.message, objectsDeleted);
  }

  const { error: deleteError } = await admin.from("weddings").delete().eq("id", weddingId);
  if (deleteError) {
    throw new WeddingPurgeError("database", deleteError.message, objectsDeleted);
  }

  const couple = [wedding.groom_name, wedding.bride_name].filter(Boolean).join(" & ");

  // Best-effort audit, written directly instead of through logAdminAction so
  // the scheduled purge (no actor) records too. Auditing never blocks a purge.
  try {
    await admin.from("audit_logs").insert({
      admin_id: options.actorId ?? null,
      action: options.auditAction ?? "retention.wedding_purge",
      target_type: "wedding",
      target_id: weddingId,
      metadata: {
        slug: wedding.slug,
        email: wedding.email,
        couple: couple || null,
        previousStatus: wedding.status,
        objectsDeleted,
        prefixes: plan.prefixes,
        ...options.auditMetadata,
      } as never,
    });
  } catch {
    // ignore — the purge itself has already succeeded.
  }

  return {
    alreadyDeleted: false,
    weddingId,
    slug: wedding.slug ?? null,
    email: wedding.email ?? null,
    couple: couple || null,
    previousStatus: wedding.status ?? null,
    objectsDeleted,
    prefixes: plan.prefixes,
  };
}

export interface GuestFolderPurgeResult {
  /** Sessions whose folders were fully removed. */
  sessions: number;
  objectsDeleted: number;
  /** Sessions whose folder could not be fully removed (retry next run). */
  failures: number;
}

/**
 * Deletes every stored object that belongs to the given guest sessions.
 *
 * Session folders are derived from the access token, so this must run while
 * the session row still exists — before `cleanup_expired_guest_data()`
 * removes it. A failure is reported per session rather than thrown, so one bad
 * prefix cannot block the rest; the caller keeps the rows around for a retry.
 *
 * Library objects are never touched: no digest prefix can match `library/`.
 */
export async function purgeGuestSessionFolders(
  tokens: Array<string | null | undefined>
): Promise<GuestFolderPurgeResult> {
  const prefixes = new Set<string>();
  for (const token of tokens) {
    if (!token) continue;
    prefixes.add(`${guestFolderDigest(token)}-`);
  }
  if (prefixes.size === 0) return { sessions: 0, objectsDeleted: 0, failures: 0 };

  const storage = await getObjectStorage();
  let sessions = 0;
  let objectsDeleted = 0;
  let failures = 0;

  for (const prefix of prefixes) {
    try {
      for (const key of await storage.list(WEDDING_BUCKET, prefix)) {
        await storage.delete(WEDDING_BUCKET, key);
        objectsDeleted += 1;
      }
      sessions += 1;
    } catch {
      failures += 1;
    }
  }

  return { sessions, objectsDeleted, failures };
}
