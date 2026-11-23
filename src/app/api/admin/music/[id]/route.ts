import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import {
  MusicValidationError,
  deleteMusicTrack,
  setMusicTrackActive,
  setMusicTrackCategories,
} from "@/lib/services/music-library";
import { consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    /** Replaces the track's category assignments. At least one is required. */
    categoryIds: z.array(z.string().uuid()).min(1, "Select at least one category").optional(),
  })
  .refine((value) => value.isActive !== undefined || value.categoryIds !== undefined, {
    message: "Nothing to update",
  });

/** Shows/hides a track and/or changes the categories it is offered in. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid track id");

    const parsed = patchSchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid request", parsed.error.flatten());

    if (parsed.data.isActive !== undefined) {
      await setMusicTrackActive(id, parsed.data.isActive);
    }
    if (parsed.data.categoryIds !== undefined) {
      await setMusicTrackCategories(id, parsed.data.categoryIds);
    }

    await logAdminAction(admin.user.id, "music.update", "music_track", id, {
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.categoryIds !== undefined
        ? { categoryIds: parsed.data.categoryIds }
        : {}),
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof MusicValidationError) return jsonError(400, e.message, { code: e.code });
    const message = e instanceof Error ? e.message : "Update failed";
    if (message === "Track not found") return jsonError(404, message);
    return adminApiError(e);
  }
}

/**
 * Deletes a library track and its object.
 *
 * Safe for published invitations: choosing a library track copies it into the
 * wedding's own folder at publish time, so every wedding referencing this track
 * keeps its own copy.
 */
export async function DELETE(req: Request, { params }: RouteContext) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid track id");

    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many admin operations. Please slow down.");
    }

    await deleteMusicTrack(id);
    await logAdminAction(admin.user.id, "music.delete", "music_track", id);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    if (message === "Track not found") return jsonError(404, message);
    return adminApiError(e);
  }
}
