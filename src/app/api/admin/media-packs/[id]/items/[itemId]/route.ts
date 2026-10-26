import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, requireAdmin } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import { deleteMediaPackItem } from "@/lib/services/media-packs";
import { consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; itemId: string }>;
}

/** DELETE — removes one photo (row and object) from a pack. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id, itemId } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id) || !UUID_RE.test(itemId)) return jsonError(400, "Invalid media id");

    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return jsonError(429, "Too many admin operations. Please slow down.");

    await deleteMediaPackItem(id, itemId);
    await logAdminAction(admin.user.id, "media_pack.item_delete", "media_pack", id, { itemId });
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    if (message === "Photo not found") return jsonError(404, message);
    return adminApiError(e);
  }
}
