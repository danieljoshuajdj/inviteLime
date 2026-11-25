import { z } from "zod";

import { MAX_HERO_IMAGES } from "@/lib/hero-content";
import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import {
  addHeroImage,
  HERO_SETTING_KEY,
  removeHeroImage,
  reorderHeroImagesByKey,
} from "@/lib/services/hero-content";
import { MediaPackValidationError } from "@/lib/services/media-packs";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ADMIN_UPLOADS_PER_HOUR = 60;

const removeSchema = z.object({ key: z.string().min(1) });
const reorderSchema = z.object({
  keys: z.array(z.string().min(1)).max(MAX_HERO_IMAGES),
});

/**
 * POST — uploads one hero carousel image.
 *
 * Multipart form: `file`. The server sniffs the real image type, optimises the
 * bytes to WebP and appends the image to the carousel.
 */
export async function POST(req: Request) {
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

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "Missing file");

    const { image, url } = await addHeroImage({
      buffer: await file.arrayBuffer(),
      declaredType: file.type,
      originalName: file.name,
    });

    await logAdminAction(admin.user.id, "settings.hero.image_upload", "site_settings", HERO_SETTING_KEY, {
      key: image.key,
    });
    return Response.json({ image: { ...image, url } }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaPackValidationError) {
      return jsonError(400, error.message, { code: error.code });
    }
    return adminApiError(error);
  }
}

/** DELETE — removes one carousel image and its object. */
export async function DELETE(req: Request) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);

    const body = await readBody(req);
    const parsed = removeSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Invalid image");

    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return jsonError(429, "Too many admin operations. Please slow down.");

    await removeHeroImage(parsed.data.key);
    await logAdminAction(admin.user.id, "settings.hero.image_delete", "site_settings", HERO_SETTING_KEY, {
      key: parsed.data.key,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    if (message === "Image not found") return jsonError(404, message);
    return adminApiError(error);
  }
}

/** PATCH — saves the carousel order. */
export async function PATCH(req: Request) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);

    const body = await readBody(req);
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Invalid image order");

    const saved = await reorderHeroImagesByKey(parsed.data.keys);
    await logAdminAction(admin.user.id, "settings.hero.reorder", "site_settings", HERO_SETTING_KEY, {
      keys: saved.images.map((image) => image.key),
    });
    return Response.json({ images: saved.images });
  } catch (error) {
    return adminApiError(error);
  }
}
