import type { BuilderDressCode, WeddingData } from "@/lib/builder/defaults";
import { defaultWeddingData, validDressColor } from "@/lib/builder/defaults";
import type { DemoDetailPack, MusicTrack } from "@/lib/library-media";
import type { RuntimeDress, RuntimeWeddingInput } from "@/lib/runtime/payload";
import type { PackDemoMedia } from "@/lib/services/media-packs";

/**
 * EXPLICIT DEMO MODE ONLY.
 *
 * Demo data exists so a template can be previewed without a customer record.
 * It is never written to the database and never mixed into live invitations.
 * Labels stay generic ("Bride", "Groom") instead of impersonating real couples.
 */
export const DEMO_WEDDING_DATA: WeddingData = defaultWeddingData({
  brideName: "Bride",
  groomName: "Groom",
  brideBio: "Demo profile for the bride — replace with your own words while customising.",
  groomBio: "Demo profile for the groom — replace with your own words while customising.",
  coupleBio: "A demo couple story shown only inside Demo Mode.",
  story:
    "This is sample copy that demonstrates how your story section will read. Every word can be edited before publishing.",
  weddingDate: "2027-02-14",
  weddingTime: "19:00",
  venue: "Demo Palace Gardens",
  address: "Sample address, Sample city, Sample state",
  mapsUrl: "https://maps.google.com/",
  latitude: null,
  longitude: null,
  events: [
    {
      name: "Mehendi",
      date: "2027-02-12",
      time: "16:00",
      venue: "Demo Palace Courtyard",
      address: null,
      mapsUrl: null,
      description: "Sample ceremony card — edit or remove it in the builder.",
    },
  ],
});

/**
 * Overlays media-pack photos onto a demo dataset.
 *
 * The stock demo ships no photos, so the bride/groom/couple sections render
 * empty in every template preview. When a template is assigned a media pack,
 * its photos and gallery fill those slots — one set uploaded once and shared by
 * every demo that uses the pack, instead of copies bundled into each ZIP.
 *
 * Slots the pack leaves empty fall back to whatever the dataset already had.
 * Names and copy stay stock: a pack is scenery, never a real couple, and live
 * invitations are untouched by this function.
 */
export function withPackMedia(data: WeddingData, media: PackDemoMedia): WeddingData {
  return {
    ...data,
    bridePhoto: media.photos.bride ?? data.bridePhoto ?? null,
    groomPhoto: media.photos.groom ?? data.groomPhoto ?? null,
    couplePhoto: media.photos.couple ?? data.couplePhoto ?? null,
    mainPhoto: media.photos.couple ?? data.mainPhoto ?? null,
    gallery:
      media.gallery.length > 0
        ? media.gallery.map((item) => ({ role: "gallery" as const, url: item.url }))
        : data.gallery,
  };
}

/**
 * Turns an admin-authored demo details pack into the builder-shaped dataset
 * every template preview already understands. Photos and music are layered on
 * separately, from the packs assigned to the same template.
 *
 * Couple packs fill the wedding fields; birthday packs fill the celebrant,
 * date/venue or age/message fields instead. Live invitations never call this:
 * they always use the customer's own data.
 */
export function demoDetailsToWeddingData(pack: DemoDetailPack): WeddingData {
  return defaultWeddingData({
    formType: pack.formType,
    celebrantName: pack.celebrantName ?? "",
    birthdayNumber: pack.birthdayNumber,
    specialMessage: pack.specialMessage ?? "",
    brideName: pack.brideName ?? "",
    groomName: pack.groomName ?? "",
    brideBio: pack.brideBio ?? "",
    groomBio: pack.groomBio ?? "",
    coupleBio: pack.coupleBio ?? "",
    story: pack.story ?? "",
    weddingDate: pack.weddingDate ?? "",
    weddingTime: pack.weddingTime,
    venue: pack.venue ?? "",
    address: pack.address ?? "",
    mapsUrl: pack.mapsUrl,
    latitude: pack.latitude,
    longitude: pack.longitude,
    events: pack.events.map((event) => ({
      name: event.name,
      date: event.date,
      time: event.time,
      venue: event.venue,
      address: event.address,
      mapsUrl: event.mapsUrl,
      description: event.description,
    })),
  });
}

/**
 * Demo-only presentation overlays. Customers now author the same fields in
 * WeddingData; detail packs keep their own copy so demo content stays separate
 * from customer drafts and live invitations. Null lets the template keep
 * whatever sample content it already ships.
 */
export function demoDetailsToRuntimeExtras(
  pack: DemoDetailPack
): Pick<RuntimeWeddingInput, "brideDesignation" | "groomDesignation" | "dress"> {
  const hasDress =
    pack.dressBrideColor ||
    pack.dressBrideColorName ||
    pack.dressGroomColor ||
    pack.dressGroomColorName;

  const dress: RuntimeDress | null = hasDress
    ? {
        bride: { color: pack.dressBrideColor, colorName: pack.dressBrideColorName },
        groom: { color: pack.dressGroomColor, colorName: pack.dressGroomColorName },
      }
    : null;

  return {
    brideDesignation: pack.brideDesignation,
    groomDesignation: pack.groomDesignation,
    dress,
  };
}

/**
 * Gives a demo its background song. A template stores only the track id; the
 * demo resolves it to a playable URL, so no audio is bundled in the ZIP and the
 * song can be swapped without republishing the template.
 */
export function withDemoMusic(data: WeddingData, track: MusicTrack): WeddingData {
  return {
    ...data,
    music: {
      role: "music",
      url: track.url,
      name: track.artist ? `${track.title} — ${track.artist}` : track.title,
    },
  };
}

function dressToRuntime(dress: BuilderDressCode | null): RuntimeDress | null {
  if (!dress?.enabled) return null;
  const bride = {
    color: validDressColor(dress.bride.color),
    colorName: dress.bride.colorName?.trim() || null,
  };
  const groom = {
    color: validDressColor(dress.groom.color),
    colorName: dress.groom.colorName?.trim() || null,
  };
  if (!bride.color && !bride.colorName && !groom.color && !groom.colorName) return null;
  return { bride, groom };
}

/** Converts builder data into the runtime contract used by every template. */
export function weddingDataToRuntimeInput(
  input: {
    id: string;
    slug: string;
    date?: string | null;
    time?: string | null;
    venue?: string | null;
    address?: string | null;
    mapsUrl?: string | null;
  },
  data: WeddingData
): RuntimeWeddingInput {
  return {
    id: input.id,
    slug: input.slug,
    formType: data.formType,
    celebrantName: data.celebrantName.trim() || null,
    birthdayNumber: data.birthdayNumber,
    specialMessage: data.specialMessage.trim() || null,
    brideName: data.brideName,
    groomName: data.groomName,
    brideBio: data.brideBio,
    groomBio: data.groomBio,
    coupleBio: data.coupleBio,
    story: data.story,
    brideDesignation: data.brideDesignation.trim() || null,
    groomDesignation: data.groomDesignation.trim() || null,
    dress: dressToRuntime(data.dress),
    date: data.weddingDate || input.date || "",
    time: data.weddingTime ?? input.time ?? null,
    venue: data.venue || input.venue || "",
    address: data.address || input.address || "",
    mapsUrl: data.mapsUrl ?? input.mapsUrl ?? null,
    latitude: data.latitude,
    longitude: data.longitude,
    events: data.events.map((ev) => ({
      name: ev.name,
      date: ev.date ?? null,
      time: ev.time ?? null,
      venue: ev.venue ?? null,
      address: ev.address ?? null,
      mapsUrl: ev.mapsUrl ?? null,
      description: ev.description ?? null,
    })),
    gallery: data.gallery.map((item) => ({ url: item.url, name: item.name })),
    photos: {
      bride: data.bridePhoto ?? null,
      groom: data.groomPhoto ?? null,
      couple: data.couplePhoto ?? null,
      main: data.mainPhoto ?? null,
    },
    music: data.music ? { url: data.music.url, name: data.music.name } : null,
  };
}
