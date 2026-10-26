import { jsonError } from "@/lib/services/helpers";
import { listMusicTracks } from "@/lib/services/music-library";

export const dynamic = "force-dynamic";

/**
 * Active library tracks, for the guest music picker.
 *
 * Public, like the template gallery: these are published platform assets that
 * anyone may listen to and attach to their invitation. Hidden tracks are
 * excluded, and the audio bytes themselves are authorized separately in
 * /api/media, which re-checks that the track is still active.
 */
export async function GET() {
  try {
    const tracks = await listMusicTracks(false);
    return Response.json(
      { tracks },
      {
        headers: {
          // Short shared cache: picking up a newly uploaded track should not
          // need a deploy, but a track hidden for abuse should disappear fast.
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    // A failure here must not break the builder: the picker degrades to
    // "upload your own track", which always works.
    return jsonError(500, "Could not load the music library");
  }
}