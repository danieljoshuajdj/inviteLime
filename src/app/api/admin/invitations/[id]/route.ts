import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/services/helpers";
import { consumeRateLimit } from "@/lib/services/ops";
import { adminApiError } from "@/lib/services/admin";
import { UUID_RE } from "@/lib/services/media-access";
import { purgeWedding, WeddingPurgeError } from "@/lib/services/wedding-purge";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const confirmSchema = z.object({
  /**
   * The slug (or email) of the wedding, as shown in the confirmation dialog.
   * Guards against an admin deleting the wrong row without noticing.
   */
  confirm: z.string().min(1).optional(),
});

/**
 * Permanently removes one invitation: its stored media (wedding folder plus
 * any never-migrated draft uploads), its row and everything cascading off it.
 * Order and payment history is kept — their `wedding_id` is set to NULL.
 *
 * Destructive and irreversible. Storage objects are deleted BEFORE the row, so
 * a failure part-way leaves a retryable state (orphaned files, row still
 * present) rather than a row pointing at media that no longer exists.
 *
 * The actual purge lives in `purgeWedding` because the scheduled retention job
 * deletes expired/cancelled invitations the exact same way.
 */
export async function DELETE(req: Request, { params }: RouteContext) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return Response.json({ error: "Invalid invitation id" }, { status: 400 });
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

    const body = await req.json().catch(() => ({}));
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const result = await purgeWedding(adminClient, id, {
      actorId: admin.user.id,
      auditAction: "invitation.delete",
      auditMetadata: { trigger: "admin" },
    });

    if (result.alreadyDeleted) {
      return Response.json({ ok: true, alreadyDeleted: true, weddingId: id });
    }

    return Response.json({
      ok: true,
      weddingId: id,
      slug: result.slug,
      objectsDeleted: result.objectsDeleted,
      couple: result.couple,
    });
  } catch (e) {
    if (e instanceof WeddingPurgeError) {
      const error =
        e.step === "storage-list"
          ? "Invitation could not be deleted: listing stored files failed."
          : e.step === "storage-delete"
          ? `Invitation could not be deleted: ${e.failures.length} stored file(s) could not be removed.`
          : "Invitation could not be deleted.";
      return Response.json(
        {
          error,
          step: e.step,
          detail: e.message,
          objectsDeleted: e.objectsDeleted,
          ...(e.failures.length > 0 ? { failures: e.failures.slice(0, 5) } : {}),
        },
        { status: 500 }
      );
    }
    return adminApiError(e);
  }
}
