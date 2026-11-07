import { createAdminClient } from "@/lib/supabase/admin";
import { TemplatesManager } from "@/components/admin/TemplatesManager";
import { storagePublicUrl } from "@/lib/services/templates";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import { listMediaPacks } from "@/lib/services/media-packs";
import { listDemoDetailPacks } from "@/lib/services/demo-details";
import { listMusicTracks } from "@/lib/services/music-library";
import type { DemoDetailPack, MediaPack, MusicTrack } from "@/lib/library-media";
import {
  buildTemplateUsageMap,
  type WeddingTemplateRef,
} from "@/lib/services/template-lifecycle";

export const dynamic = "force-dynamic";

const mockTemplates = [
  {
    id: "aaaaaaaa-1111-1111-1111-111111111111",
    name: "Royal Mughal Palace",
    slug: "royal-mughal-palace",
    description: "Ornate maroon and gold palace theme with jhalar borders.",
    status: "active" as const,
    formType: "wedding",
    thumbnailUrl: null,
    product: { id: "p1", name: "Single Invitation", pricePaise: 149900, currency: "INR", active: true },
    currentVersion: "1.4.0",
    versionCount: 4,
    activeInvitations: 3,
    totalInvitations: 5,
    categories: ["Wedding"],
    mediaPackId: "preview-pack-1",
    mediaPackName: "Royal couple",
    demoDetailPackId: "preview-details-1",
    demoDetailPackName: "Royal Tamil wedding",
    musicTrackId: "preview-track-1",
    musicTrackName: "Golden Hour Sitar — Invite Lime Studio",
  },
  {
    id: "bbbbbbbb-2222-2222-2222-222222222222",
    name: "Coastal Villa Sunset",
    slug: "coastal-villa-sunset",
    description: "Airy pastel layout for destination weddings by the sea.",
    status: "active" as const,
    formType: "engagement",
    thumbnailUrl: null,
    product: { id: "p1", name: "Single Invitation", pricePaise: 149900, currency: "INR", active: true },
    currentVersion: "2.1.0",
    versionCount: 2,
    activeInvitations: 1,
    totalInvitations: 2,
    categories: ["Engagement"],
    mediaPackId: null,
    mediaPackName: null,
    demoDetailPackId: null,
    demoDetailPackName: null,
    musicTrackId: "preview-track-2",
    musicTrackName: "Monsoon Strings",
  },
  {
    id: "cccccccc-3333-3333-3333-333333333333",
    name: "Minimal Vows",
    slug: "minimal-vows",
    description: "Type-led single page for modern, low-key ceremonies.",
    status: "draft" as const,
    formType: "wedding",
    thumbnailUrl: null,
    product: null,
    currentVersion: null,
    versionCount: 1,
    activeInvitations: 0,
    totalInvitations: 0,
    categories: [],
    mediaPackId: null,
    mediaPackName: null,
    demoDetailPackId: null,
    demoDetailPackName: null,
    musicTrackId: null,
    musicTrackName: null,
  },
];

// Sample packs so the wizard's Demo Content step is reviewable in preview mode.
const mockMediaPacks: MediaPack[] = [
  {
    id: "preview-pack-1",
    name: "Royal couple",
    description: "Warm palace tones for heritage and grand templates.",
    formType: "wedding",
    items: [
      { id: "pp-1", role: "bride", url: "", mimeType: "image/webp", sizeBytes: 240_000, sortOrder: 1, createdAt: "2026-01-10T00:00:00.000Z" },
      { id: "pp-2", role: "groom", url: "", mimeType: "image/webp", sizeBytes: 252_000, sortOrder: 2, createdAt: "2026-01-10T00:00:00.000Z" },
      { id: "pp-3", role: "couple", url: "", mimeType: "image/webp", sizeBytes: 310_000, sortOrder: 3, createdAt: "2026-01-10T00:00:00.000Z" },
      { id: "pp-4", role: "gallery", url: "", mimeType: "image/webp", sizeBytes: 198_000, sortOrder: 4, createdAt: "2026-01-10T00:00:00.000Z" },
    ],
    templateCount: 2,
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
  },
  {
    id: "preview-pack-2",
    name: "Coastal pastel",
    description: "Airy seaside set for destination engagement templates.",
    formType: "engagement",
    items: [],
    templateCount: 0,
    createdAt: "2026-02-02T00:00:00.000Z",
    updatedAt: "2026-02-02T00:00:00.000Z",
  },
];

// Sample packs so the wizard's Demo Content step is reviewable in preview mode.
const mockMusicTracks: MusicTrack[] = [
  {
    id: "preview-track-1",
    title: "Golden Hour Sitar",
    artist: "Invite Lime Studio",
    url: "",
    mimeType: "audio/mpeg",
    sizeBytes: 2_400_000,
    durationMs: 90_000,
    isActive: true,
    categories: [
      { id: "d1", name: "Wedding", slug: "wedding" },
      { id: "d2", name: "Engagement", slug: "engagement" },
    ],
    createdAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "preview-track-2",
    title: "Monsoon Strings",
    artist: null,
    url: "",
    mimeType: "audio/mpeg",
    sizeBytes: 2_100_000,
    durationMs: 84_000,
    isActive: true,
    categories: [{ id: "d2", name: "Engagement", slug: "engagement" }],
    createdAt: "2026-01-06T00:00:00.000Z",
  },
];

const mockDetailPacks: DemoDetailPack[] = [
  {
    id: "preview-details-1",
    name: "Royal Tamil wedding",
    description: "Traditional palace celebration with warm gold and rose tones.",
    formType: "wedding",
    brideName: "Karthika M.",
    groomName: "Jeya Chandran S.",
    celebrantName: null,
    birthdayNumber: null,
    specialMessage: null,
    brideDesignation: "M.Sc. — Product designer",
    groomDesignation: "M.Tech — Software engineer",
    brideBio: null,
    groomBio: null,
    coupleBio: null,
    story: null,
    weddingDate: "2027-02-14",
    weddingTime: "19:00",
    venue: "The Leela Palace",
    address: "Adyar, Chennai, Tamil Nadu",
    mapsUrl: "https://maps.google.com/",
    latitude: 13.0827,
    longitude: 80.2707,
    dressBrideColor: "#c2647a",
    dressBrideColorName: "Rosewood",
    dressGroomColor: "#1f3d3a",
    dressGroomColorName: "Deep teal",
    rsvpDeadline: "2027-02-01",
    rsvpContactName: "Anand",
    rsvpContactPhone: "+91 98765 43210",
    rsvpWhatsapp: "https://wa.me/919876543210",
    events: [
      {
        id: "preview-event-1",
        name: "Mehendi",
        date: "2027-02-12",
        time: "16:00",
        venue: "Palace Courtyard",
        address: null,
        mapsUrl: null,
        description: null,
        sortOrder: 0,
      },
      {
        id: "preview-event-2",
        name: "Reception",
        date: "2027-02-15",
        time: "19:00",
        venue: "The Leela Palace Lawns",
        address: null,
        mapsUrl: null,
        description: null,
        sortOrder: 1,
      },
    ],
    templateCount: 2,
    createdAt: "2026-01-12T00:00:00.000Z",
    updatedAt: "2026-01-12T00:00:00.000Z",
  },
];

// Sample rows are for local UI review only. Outside preview mode an empty
// result must render as empty, never as invented data.
const mockCategories = [
  { id: "d1", name: "Wedding", slug: "wedding" },
  { id: "d2", name: "Engagement", slug: "engagement" },
  { id: "d3", name: "Birthday Celebration", slug: "birthday-celebration" },
  { id: "d4", name: "Birthday Wishes", slug: "birthday-wishes" },
];

const mockTags = [
  { id: "t1", name: "Luxury", slug: "luxury" },
  { id: "t2", name: "Destination", slug: "destination" },
  { id: "t3", name: "Traditional", slug: "traditional" },
  { id: "t4", name: "Modern", slug: "modern" },
];

export default async function AdminTemplatesPage() {
  const admin = createAdminClient();

  const [templatesRes, categoriesRes, productsRes, tagsRes, weddingsRes, mediaPacks, detailPacks, musicTracks] = await Promise.all([
    admin.from("templates").select(
      `id, name, slug, description, status, form_type, thumbnail_path,
       product_id, product:product_id(id, name, price_paise, currency, active),
       media_pack_id, media_pack:media_pack_id(id, name),
       demo_detail_pack_id, demo_detail_pack:demo_detail_pack_id(id, name),
       music_track_id, music_track:music_track_id(id, title, artist),
       versions:template_versions(id, version, is_current),
       template_categories(category_id, category:category_id(id, name))`
    ),
    admin.from("categories").select("id, name, slug").order("name"),
    admin.from("products").select("id, name, price_paise, currency, active").eq("active", true).order("price_paise"),
    admin.from("tags").select("id, name, slug").order("name"),
    admin.from("weddings").select("id, template_id, template_version_id, status, expiration_date"),
    // The media_packs tables arrive with migration 00011; an older database
    // should still render this page, just without media packs.
    listMediaPacks().catch((err) => {
      console.warn("[admin/templates] could not load media packs:", err);
      return [] as MediaPack[];
    }),
    // Migration 00013 adds details packs; an older database renders the page
    // without them.
    listDemoDetailPacks().catch((err) => {
      console.warn("[admin/templates] could not load details packs:", err);
      return [] as DemoDetailPack[];
    }),
    listMusicTracks(true).catch((err) => {
      console.warn("[admin/templates] could not load music tracks:", err);
      return [] as MusicTrack[];
    }),
  ]);

  const versionsByTemplate = new Map<string, string[]>();
  for (const t of (templatesRes.data as Array<{ id: string; versions: Array<{ id: string }> | null }> | null) ?? []) {
    versionsByTemplate.set(t.id, Array.isArray(t.versions) ? t.versions.map((v) => v.id) : []);
  }
  const usageMap = buildTemplateUsageMap(
    (weddingsRes.data as WeddingTemplateRef[] | null) ?? [],
    versionsByTemplate
  );

  const mapped = ((templatesRes.data as Array<{
    id: string; name: string; slug: string; description: string | null;
    status: "active" | "disabled" | "draft"; form_type: string; thumbnail_path: string | null;
    product: { id: string; name: string; price_paise: number; currency: string; active: boolean } | null;
    media_pack_id: string | null;
    media_pack: { id: string; name: string } | null;
    demo_detail_pack_id: string | null;
    demo_detail_pack: { id: string; name: string } | null;
    music_track_id: string | null;
    music_track: { id: string; title: string; artist: string | null } | null;
    versions: Array<{ id: string; version: string; is_current: boolean }> | null;
    template_categories: Array<{ category_id: string; category: { id: string; name: string } | null }> | null;
  }> | null) ?? []).map((t) => {
    const usage = usageMap.get(t.id) ?? { activeInvitations: 0, totalInvitations: 0 };
    return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description ?? null,
    status: t.status,
    formType: t.form_type,
    thumbnailUrl: t.thumbnail_path ? storagePublicUrl("templates", t.thumbnail_path) : null,
    product: t.product
      ? {
          id: t.product.id,
          name: t.product.name,
          pricePaise: t.product.price_paise,
          currency: t.product.currency,
          active: t.product.active,
        }
      : null,
    currentVersion: t.versions?.find((v) => v.is_current)?.version ?? null,
    versionCount: Array.isArray(t.versions) ? t.versions.length : 0,
    activeInvitations: usage.activeInvitations,
    totalInvitations: usage.totalInvitations,
    categories: Array.isArray(t.template_categories)
      ? (t.template_categories.map((tc) => tc.category?.name ?? "").filter(Boolean) as string[])
      : [],
    mediaPackId: t.media_pack_id ?? null,
    mediaPackName: t.media_pack?.name ?? null,
    demoDetailPackId: t.demo_detail_pack_id ?? null,
    demoDetailPackName: t.demo_detail_pack?.name ?? null,
    musicTrackId: t.music_track_id ?? null,
    musicTrackName: t.music_track
      ? t.music_track.artist
        ? `${t.music_track.title} — ${t.music_track.artist}`
        : t.music_track.title
      : null,
  }; });

  const categories = ((categoriesRes.data as Array<{ id: string; name: string; slug: string }> | null) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  const products = ((productsRes.data as Array<{ id: string; name: string; price_paise: number; currency: string; active: boolean }> | null) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    pricePaise: p.price_paise,
    currency: p.currency,
    active: p.active,
  }));

  const tags = ((tagsRes.data as Array<{ id: string; name: string; slug: string }> | null) ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
  }));

  // Sample rows are for local UI review only. Outside preview mode an empty
  // result must render as empty, never as invented data.
  const rows = mapped.length > 0 ? mapped : isAdminPreviewMode() ? mockTemplates : [];
  const options = {
    categories: categories.length > 0 ? categories : isAdminPreviewMode() ? mockCategories : [],
    tags: tags.length > 0 ? tags : isAdminPreviewMode() ? mockTags : [],
    mediaPacks: mediaPacks.length > 0 ? mediaPacks : isAdminPreviewMode() ? mockMediaPacks : [],
    detailPacks: detailPacks.length > 0 ? detailPacks : isAdminPreviewMode() ? mockDetailPacks : [],
    musicTracks: musicTracks.length > 0 ? musicTracks : isAdminPreviewMode() ? mockMusicTracks : [],
  };
  return (
    <TemplatesManager
      templates={rows}
      categories={options.categories}
      products={products}
      tags={options.tags}
      mediaPacks={options.mediaPacks}
      detailPacks={options.detailPacks}
      musicTracks={options.musicTracks}
    />
  );
}