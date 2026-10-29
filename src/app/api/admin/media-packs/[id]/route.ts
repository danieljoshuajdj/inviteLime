import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import {
  MediaPackValidationError,
  deleteMediaPack,
  updateMediaPack,
} from "@/lib/services/media-packs";
import { consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(300).nullable().optional(),
    formType: z
      .enum(["wedding", "engagement", "birthday_celebration", "birthday_wishes"])
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/** Renames a pack or edits its description. Photos are managed separately. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid media pack id");

    const parsed = patchSchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid media pack", parsed.error.flatten());

    await updateMediaPack(id, {
      name: parsed.data.name,
      description: parsed.data.description,
      formType: parsed.data.formType,
    });

    await logAdminAction(admin.user.id, "media_pack.update", "media_pack", id, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.formType !== undefined ? { formType: parsed.data.formType } : {}),
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof MediaPackValidationError) return jsonError(400, e.message, { code: e.code });
    return adminApiError(e);
  }
}

/**
 * Deletes a pack, its photos and its objects.
 *
 * Templates using the pack are detached (FK `on delete set null`) and fall back
 * to the images bundled in their package; the admin UI warns with the count
 * before this runs.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid media pack id");

    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return jsonError(429, "Too many admin operations. Please slow down.");

    const result = await deleteMediaPack(id);
    await logAdminAction(admin.user.id, "media_pack.delete", "media_pack", id, {
      removedObjects: result.removedObjects,
    });
    return Response.json({ ok: true, removedObjects: result.removedObjects });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    if (message === "Media pack not found") return jsonError(404, message);
    return adminApiError(e);
  }
}
