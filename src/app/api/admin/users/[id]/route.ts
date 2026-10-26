import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, readBody } from "@/lib/services/helpers";
import { adminApiError, logAdminAction, updateUserRole, updateUserStatus } from "@/lib/services/admin";
import { consumeRateLimit } from "@/lib/services/ops";
import { UUID_RE } from "@/lib/services/media-access";
import { mediaKeysInWeddingData, planWeddingObjectDeletion } from "@/lib/services/invitation-deletion";
import { getObjectStorage, WEDDING_BUCKET } from "@/lib/services/storage";

export const dynamic = "force-dynamic";

const roleSchema = z.object({ role: z.string() }).partial();
const statusSchema = z.object({ status: z.string() }).partial();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    // Role/status changes are sensitive; cap how fast they can be issued.
    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return Response.json({ error: "Too many admin operations. Please slow down." }, { status: 429 });
    const body = await readBody(req);
    const roleParse = roleSchema.safeParse(body);
    const statusParse = statusSchema.safeParse(body);

    if (roleParse.success && roleParse.data.role) {
      await updateUserRole(id, roleParse.data.role);
      await logAdminAction(admin.user.id, "user.role_change", "user", id, { role: roleParse.data.role });
    }
    if (statusParse.success && statusParse.data.status) {
      await updateUserStatus(id, statusParse.data.status);
      await logAdminAction(admin.user.id, "user.status_change", "user", id, { status: statusParse.data.status });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return adminApiError(e);
  }
}

/**
 * Permanently removes a user and everything they own: their invitations (with
 * stored media, events, RSVPs and views), their orders, delivery/analytics
 * history, audit rows about them, and finally the auth account itself (which
 * cascades `profiles` and `favorite_templates` in the database).
 *
 * Order matters for safety:
 *  1. Storage objects first — a failure there leaves a retryable state
 *     (orphaned files, all rows still present).
 *  2. User-owned rows next, every delete idempotent so a retry can finish.
 *  3. The auth user last — if it fails, the account still exists and a retry
 *     re-runs the (now no-op) row deletes before completing.
 */
export async function DELETE(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }
    if (id === admin.user.id) {
      return Response.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return Response.json({ error: "Too many admin operations. Please slow down." }, { status: 429 });
    }

    const adminClient = createAdminClient();

    const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(id);
    if (targetError && !/not found/i.test(targetError.message)) {
      return Response.json({ error: targetError.message }, { status: 500 });
    }

    if (!target?.user) {
      // Already gone. The profile cascade took user-owned rows with it, but
      // audit references are plain text and survive — purge those too.
      await adminClient.from("audit_logs").delete().eq("target_id", id);
      return Response.json({ ok: true, alreadyDeleted: true });
    }

    // The typed confirmation must match the account's email (or its id when
    // the account somehow has none), so the wrong row cannot be deleted by
    // clicking through the dialog.
    const email = (target.user.email ?? "").trim();
    const expected = email || id;
    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
    const confirm = typeof body?.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
    if (confirm !== expected.toLowerCase()) {
      return Response.json({ error: "Confirmation did not match the account's email." }, { status: 400 });
    }

    const { data: weddingRows, error: weddingError } = await adminClient
      .from("weddings")
      .select("id, slug, email, bride_name, groom_name, status, guest_session_id, wedding_data")
      .eq("user_id", id);
    if (weddingError) {
      return Response.json({ error: weddingError.message }, { status: 500 });
    }
    const weddings = weddingRows ?? [];
    const weddingIds = weddings.map((w) => w.id);

    // ── 1. Storage: same object plan as a single invitation delete ────
    let objectsDeleted = 0;
    for (const wedding of weddings) {
      const { data: mediaRows } = await adminClient
        .from("wedding_media")
        .select("storage_key")
        .eq("wedding_id", wedding.id);

      let guestTokens: (string | null)[] = [];
      if (wedding.guest_session_id) {
        const { data: session } = await adminClient
          .from("guest_sessions")
          .select("access_token")
          .eq("id", wedding.guest_session_id)
          .maybeSingle();
        guestTokens = [session?.access_token ?? null];
      }

      const plan = planWeddingObjectDeletion({
        weddingId: wedding.id,
        guestAccessTokens: guestTokens,
        // Recorded rows are not the whole story: a draft's uploads may live
        // only in the builder blob when migration never completed.
        recordedKeys: [
          ...(mediaRows ?? []).map((m) => m.storage_key),
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
        return Response.json(
          {
            error: "User could not be deleted: listing stored files failed.",
            step: "storage-list",
            detail: err instanceof Error ? err.message : "storage error",
          },
          { status: 500 }
        );
      }

      const failures: { key: string; detail: string }[] = [];
      for (const key of keys) {
        try {
          await storage.delete(WEDDING_BUCKET, key);
          objectsDeleted += 1;
        } catch (err) {
          failures.push({ key, detail: err instanceof Error ? err.message : "storage error" });
          if (failures.length >= 5) break;
        }
      }
      if (failures.length > 0) {
        // Stop before touching any row so a retry can finish the cleanup.
        return Response.json(
          {
            error: `User could not be deleted: ${failures.length} stored file(s) could not be removed.`,
            step: "storage-delete",
            detail: failures[0].detail,
            objectsDeleted,
            failures: failures.slice(0, 5),
          },
          { status: 500 }
        );
      }
    }

    // ── 2. User-owned rows, all idempotent ────────────────────────────
    // Wedding-linked rows are matched before the wedding delete, because
    // deleting the wedding would otherwise set their wedding_id to NULL and
    // make them unreachable.
    async function exec(step: string, query: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await query;
      if (error) throw new Error(`${step}: ${error.message}`);
    }
    try {
      await exec("orders", adminClient.from("orders").delete().eq("user_id", id));
      await exec("email_deliveries", adminClient.from("email_deliveries").delete().eq("user_id", id));
      await exec("analytics_events", adminClient.from("analytics_events").delete().eq("user_id", id));
      await exec("audit_logs", adminClient.from("audit_logs").delete().eq("admin_id", id));
      await exec("audit_logs", adminClient.from("audit_logs").delete().in("target_id", [id, ...weddingIds]));
      if (weddingIds.length > 0) {
        await exec("orders", adminClient.from("orders").delete().in("wedding_id", weddingIds));
        await exec("email_deliveries", adminClient.from("email_deliveries").delete().in("wedding_id", weddingIds));
        await exec("analytics_events", adminClient.from("analytics_events").delete().in("wedding_id", weddingIds));
        // Payments are usually retained as financial history (the FK only
        // nulls the link), but a user erasure must not keep rows that identify
        // the account, so they are removed explicitly here.
        await exec("payments", adminClient.from("payments").delete().in("wedding_id", weddingIds));
        // Cascades wedding_events, wedding_media, guest_list, rsvp_responses
        // and invitation_views.
        await exec("weddings", adminClient.from("weddings").delete().in("id", weddingIds));
      }
    } catch (err) {
      return Response.json(
        { error: `User could not be deleted: ${(err as Error).message}`, step: "rows" },
        { status: 500 }
      );
    }

    // ── 3. The auth account last ──────────────────────────────────────
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);
    if (deleteError && !/not found/i.test(deleteError.message)) {
      return Response.json(
        { error: `Rows were removed but the account still exists: ${deleteError.message}`, step: "auth-user" },
        { status: 500 }
      );
    }

    // Audit after the purge above, so this record itself survives; metadata
    // carries counts only — no details of the deleted account.
    await logAdminAction(admin.user.id, "user.delete", "user", id, {
      weddings: weddings.length,
      objectsDeleted,
    });

    return Response.json({ ok: true, weddingsDeleted: weddings.length, objectsDeleted });
  } catch (e) {
    return adminApiError(e);
  }
}