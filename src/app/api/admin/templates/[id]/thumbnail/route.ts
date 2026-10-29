/**
 * Template thumbnail upload endpoint.
 *
 * POST /api/admin/templates/[id]/thumbnail
 *   Replaces the template's marketplace thumbnail without requiring a new
 *   package version. Uploads to the stable `{templateId}/thumbnail` key and
 *   updates `templates.thumbnail_path`, so every card that resolves the
 *   thumbnail from that column picks up the new image.
 */

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, requireAdmin } from "@/lib/services/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";
import {
  getObjectStorage,
  MAX_IMAGE_BYTES,
  TEMPLATE_BUCKET,
} from "@/lib/services/storage";
import { storagePublicUrl } from "@/lib/services/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ADMIN_UPLOADS_PER_HOUR = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);

    const limit = await consumeRateLimit({
      bucket: "upload",
      key: clientKey(req),
      limit: MAX_ADMIN_UPLOADS_PER_HOUR,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return jsonError(429, "Too many uploads. Please try again later.");

    const adminClient = createAdminClient();
    const { data: template, error: tErr } = await adminClient
      .from("templates")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!template) return jsonError(404, "Template not found");

    const form = await req.formData();
    const thumbnail = form.get("thumbnail");
    if (!(thumbnail instanceof File) || thumbnail.size === 0) {
      return jsonError(400, "Choose a thumbnail image to upload");
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(thumbnail.type)) {
      return jsonError(400, "Thumbnail must be PNG, JPEG, or WebP");
    }
    if (thumbnail.size > MAX_IMAGE_BYTES) {
      return jsonError(400, "Thumbnail exceeds the 15 MB limit");
    }

    const thumbnailPath = `${id}/thumbnail`;
    const storage = await getObjectStorage();
    try {
      await storage.upload(
        TEMPLATE_BUCKET,
        thumbnailPath,
        Buffer.from(await thumbnail.arrayBuffer()),
        { contentType: thumbnail.type, upsert: true, cacheControl: "60" }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(502, `Thumbnail upload failed: ${message}`);
    }

    const { error: updateErr } = await adminClient
      .from("templates")
      .update({ thumbnail_path: thumbnailPath })
      .eq("id", id);
    if (updateErr) return jsonError(500, updateErr.message);

    await logAdminAction(admin.user.id, "template.thumbnail_upload", "template", id, {
      thumbnailPath,
    });

    // The key is stable, so bust the browser cache for the freshly replaced
    // image while leaving the DB value clean.
    const url = storagePublicUrl(TEMPLATE_BUCKET, thumbnailPath);
    const thumbnailUrl = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;

    return Response.json({ ok: true, thumbnailPath, thumbnailUrl });
  } catch (e) {
    return adminApiError(e);
  }
}
