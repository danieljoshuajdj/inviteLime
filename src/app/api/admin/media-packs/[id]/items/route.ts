import { randomUUID } from "node:crypto";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, requireAdmin } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import {
  MediaPackValidationError,
  normalizePackRole,
  uploadMediaPackItem,
} from "@/lib/services/media-packs";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ADMIN_UPLOADS_PER_HOUR = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/media-packs/[id]/items — uploads one photo into a pack.
 *
 * Multipart form: `file` (the image) and `role` (bride/groom/couple/gallery).
 * Single-photo roles replace their previous photo; gallery accumulates.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid media pack id");

    const limit = await consumeRateLimit({
      bucket: "upload",
      key: clientKey(req),
      limit: MAX_ADMIN_UPLOADS_PER_HOUR,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return jsonError(429, "Too many uploads. Please try again later.");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "Missing file");
    const role = normalizePackRole(form.get("role"));

    const item = await uploadMediaPackItem({
      packId: id,
      role,
      buffer: await file.arrayBuffer(),
      declaredType: file.type,
      originalName: file.name,
      randomSuffix: randomUUID().replace(/-/g, "").slice(0, 12),
    });

    await logAdminAction(admin.user.id, "media_pack.item_upload", "media_pack", id, {
      role,
      itemId: item.id,
    });
    return Response.json({ item }, { status: 201 });
  } catch (e) {
    if (e instanceof MediaPackValidationError) return jsonError(400, e.message, { code: e.code });
    const message = e instanceof Error ? e.message : "Upload failed";
    if (message === "Media pack not found") return jsonError(404, message);
    return adminApiError(e);
  }
}
