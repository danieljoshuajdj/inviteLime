import { MusicManager } from "@/components/admin/MusicManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import { listMusicTracks } from "@/lib/services/music-library";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MusicTrack, MusicTrackCategory } from "@/lib/library-media";

export const dynamic = "force-dynamic";

const previewCategories: MusicTrackCategory[] = [
  { id: "d1", name: "Wedding", slug: "wedding" },
  { id: "d2", name: "Engagement", slug: "engagement" },
  { id: "d3", name: "Birthday Celebration", slug: "birthday-celebration" },
  { id: "d4", name: "Birthday Wishes", slug: "birthday-wishes" },
];

function previewTracks(categories: MusicTrackCategory[]): MusicTrack[] {
  return [
    {
      id: "preview-1",
      title: "First Dance",
      artist: "Sample Artist",
      url: "",
      mimeType: "audio/mpeg",
      sizeBytes: 3_400_000,
      durationMs: 214_000,
      isActive: true,
      categories: categories.filter((category) => category.slug === "wedding"),
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
      categories: categories.filter((category) =>
        ["wedding", "engagement"].includes(category.slug)
      ),
      createdAt: new Date("2026-02-02").toISOString(),
    },
  ];
}

export default async function AdminMusicPage() {
  let tracks: MusicTrack[] = [];
  try {
    tracks = await listMusicTracks(true);
  } catch (err) {
    // The library table arrives with migration 00009; an older database should
    // show an empty, working page rather than a 500 for the whole admin tab.
    console.warn("[admin/music] could not load library:", err);
  }

  let categories: MusicTrackCategory[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("categories").select("id, name, slug").order("name");
    categories = ((data as MusicTrackCategory[] | null) ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    }));
  } catch (err) {
    console.warn("[admin/music] could not load categories:", err);
  }

  const preview = isAdminPreviewMode();
  const availableCategories = categories.length > 0 ? categories : preview ? previewCategories : [];

  return (
    <MusicManager
      initialTracks={tracks.length > 0 ? tracks : preview ? previewTracks(availableCategories) : []}
      categories={availableCategories}
    />
  );
}
