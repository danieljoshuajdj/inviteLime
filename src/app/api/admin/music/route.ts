import { randomUUID } from "node:crypto";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, requireAdmin } from "@/lib/services/helpers";
import {
  MusicValidationError,
  createMusicTrack,
  listMusicTracks,
  normalizeArtist,
  normalizeTitle,
} from "@/lib/services/music-library";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

const MAX_ADMIN_UPLOADS_PER_HOUR = 60;

/** Every track, including hidden ones. Admin view only. */
export async function GET() {
  try {
    const supabase = await createServerClient();
    await requireAdmin(supabase);
    return Response.json({ tracks: await listMusicTracks(true) });
  } catch (e) {
    return adminApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
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

    const title = normalizeTitle(form.get("title"));
    const artist = normalizeArtist(form.get("artist"));
    const durationRaw = Number(form.get("durationMs"));
    const durationMs =
      Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(Math.round(durationRaw), 24 * 60 * 60 * 1000) : null;

    const track = await createMusicTrack({
      buffer: await file.arrayBuffer(),
      declaredType: file.type,
      originalName: file.name,
      title,
      artist,
      durationMs,
      categoryIds: form.getAll("categoryIds"),
      randomSuffix: randomUUID().replace(/-/g, "").slice(0, 12),
    });

    await logAdminAction(admin.user.id, "music.create", "music_track", track.id, { title: track.title });
    return Response.json({ track }, { status: 201 });
  } catch (e) {
    if (e instanceof MusicValidationError) {
      const status = e.code === "FILE_TOO_LARGE" || e.code === "UNSUPPORTED_FILE_TYPE" ? 400 : 400;
      return jsonError(status, e.message, { code: e.code });
    }
    return adminApiError(e);
  }
}