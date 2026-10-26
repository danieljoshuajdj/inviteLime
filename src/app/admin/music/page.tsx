import { MusicManager } from "@/components/admin/MusicManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import { listMusicTracks } from "@/lib/services/music-library";
import type { MusicTrack } from "@/lib/library-media";

export const dynamic = "force-dynamic";

const previewTracks: MusicTrack[] = [
  {
    id: "preview-1",
    title: "First Dance",
    artist: "Sample Artist",
    url: "",
    mimeType: "audio/mpeg",
    sizeBytes: 3_400_000,
    durationMs: 214_000,
    isActive: true,
    createdAt: new Date("2026-01-15").toISOString(),
  },
  {
    id: "preview-2",
    title: "A Thousand Years ( instrumental )",
    artist: "Preview Orchestra",
    url: "",
    mimeType: "audio/mpeg",
    sizeBytes: 5_100_000,
    durationMs: 259_000,
    isActive: false,
    createdAt: new Date("2026-02-02").toISOString(),
  },
];

export default async function AdminMusicPage() {
  let tracks: MusicTrack[] = [];
  try {
    tracks = await listMusicTracks(true);
  } catch (err) {
    // The library table arrives with migration 00009; an older database should
    // show an empty, working page rather than a 500 for the whole admin tab.
    console.warn("[admin/music] could not load library:", err);
  }

  const preview = isAdminPreviewMode();
  return <MusicManager initialTracks={tracks.length > 0 ? tracks : preview ? previewTracks : []} />;
}