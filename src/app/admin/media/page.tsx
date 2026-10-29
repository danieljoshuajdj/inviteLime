import { MediaManager } from "@/components/admin/MediaManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import { listMediaPacks } from "@/lib/services/media-packs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaPack } from "@/lib/library-media";

export const dynamic = "force-dynamic";

// Sample rows are for local UI review only. Outside preview mode an empty
// result must render as empty, never as invented data.
const previewPacks: MediaPack[] = [
  {
    id: "preview-pack-1",
    name: "Royal couple",
    description: "Warm palace tones for heritage and grand templates.",
    formType: "wedding",
    items: [
      { id: "pp-1", role: "bride", url: "", mimeType: "image/webp", sizeBytes: 240_000, sortOrder: 1, createdAt: new Date("2026-01-10").toISOString() },
      { id: "pp-2", role: "groom", url: "", mimeType: "image/webp", sizeBytes: 252_000, sortOrder: 2, createdAt: new Date("2026-01-10").toISOString() },
      { id: "pp-3", role: "couple", url: "", mimeType: "image/webp", sizeBytes: 310_000, sortOrder: 3, createdAt: new Date("2026-01-10").toISOString() },
      { id: "pp-4", role: "gallery", url: "", mimeType: "image/webp", sizeBytes: 198_000, sortOrder: 4, createdAt: new Date("2026-01-10").toISOString() },
      { id: "pp-5", role: "gallery", url: "", mimeType: "image/webp", sizeBytes: 204_000, sortOrder: 5, createdAt: new Date("2026-01-10").toISOString() },
    ],
    templateCount: 2,
    createdAt: new Date("2026-01-10").toISOString(),
    updatedAt: new Date("2026-01-10").toISOString(),
  },
  {
    id: "preview-pack-2",
    name: "Coastal pastel",
    description: "Airy seaside set for destination engagement templates.",
    formType: "engagement",
    items: [
      { id: "pp-6", role: "bride", url: "", mimeType: "image/webp", sizeBytes: 220_000, sortOrder: 1, createdAt: new Date("2026-02-02").toISOString() },
      { id: "pp-7", role: "groom", url: "", mimeType: "image/webp", sizeBytes: 226_000, sortOrder: 2, createdAt: new Date("2026-02-02").toISOString() },
    ],
    templateCount: 0,
    createdAt: new Date("2026-02-02").toISOString(),
    updatedAt: new Date("2026-02-02").toISOString(),
  },
];

export default async function AdminMediaPage() {
  let packs: MediaPack[] = [];
  try {
    packs = await listMediaPacks();
  } catch (err) {
    // The media_packs table arrives with migration 00011; an older database
    // should show an empty, working page rather than a 500 for the whole tab.
    console.warn("[admin/media] could not load media packs:", err);
  }

  let categories: { id: string; name: string; slug: string }[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("categories").select("id, name, slug").order("name");
    categories = ((data as { id: string; name: string; slug: string }[] | null) ?? []).map(
      (category) => ({ id: category.id, name: category.name, slug: category.slug })
    );
  } catch (err) {
    console.warn("[admin/media] could not load categories:", err);
  }

  const preview = isAdminPreviewMode();
  return (
    <MediaManager
      initialPacks={packs.length > 0 ? packs : preview ? previewPacks : []}
      categories={categories}
    />
  );
}
