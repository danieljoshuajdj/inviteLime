/**
 * Client-safe constants for the shared platform libraries (music and media
 * packs).
 *
 * `media-access.ts` cannot be imported from a client component: it pulls in
 * `node:crypto` for the guest-folder digest, which has no browser build. The
 * library prefix is needed on both sides (server authorization and the guest
 * picker), so it lives here and `media-access.ts` re-exports it, keeping one
 * source of truth.
 */

import type { FormType } from "@/lib/builder/forms";

/** Storage folder holding platform-managed library objects. */
export const LIBRARY_FOLDER = "library";

/**
 * Largest accepted library upload, in bytes.
 *
 * Defined here rather than in the music service because the admin uploader is a
 * client component, and importing the service would pull the storage client (and
 * its `server-only` guard) into the browser bundle. The server enforces the same
 * limit independently in `validateMusicUpload`.
 */
export const MAX_MUSIC_BYTES = 10 * 1024 * 1024;

/** Role directory within the library folder holding audio tracks. */
export const LIBRARY_MUSIC_ROLE = "music";

/** Role directory within the library folder holding media-pack photos. */
export const LIBRARY_MEDIA_ROLE = "media";

/**
 * A library track as offered to the guest picker and the admin list.
 *
 * Declared here, in the client-safe module, so components can type against it
 * without importing the storage-backed service.
 */
export interface MusicTrackCategory {
  id: string;
  name: string;
  slug: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  durationMs: number | null;
  isActive: boolean;
  /** Event categories this track is offered in. At least one in normal use. */
  categories: MusicTrackCategory[];
  createdAt: string;
}

/** True when a track is offered in the given event category. */
export function musicTrackInCategory(
  track: { categories: MusicTrackCategory[] },
  categorySlug: string | null | undefined
): boolean {
  if (!categorySlug) return false;
  return track.categories.some((category) => category.slug === categorySlug);
}


/** App URL prefix that serves library objects. */
export const LIBRARY_MEDIA_PREFIX = `/api/media/${LIBRARY_FOLDER}/${LIBRARY_MUSIC_ROLE}/`;

/**
 * True when a media URL points at a library object.
 *
 * Lets the builder tell a library pick from the guest's own upload without
 * changing the `music` payload shape that the runtime already understands.
 */
export function isLibraryMediaUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const at = url.indexOf("/api/media/");
  return at !== -1 && url.slice(at).startsWith(LIBRARY_MEDIA_PREFIX);
}

/** File name shown in the builder for a library track. */
export function libraryTrackName(track: { title: string; artist: string | null }): string {
  return track.artist ? `${track.title} — ${track.artist}` : track.title;
}

// ── Media packs ───────────────────────────────────────────────────────────

/**
 * Largest accepted media-pack photo, in bytes.
 *
 * Mirrors the wedding image limit; the service asserts the two stay equal so
 * the picker hint and the server check cannot drift apart.
 */
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

/** Roles a media-pack photo can fill. bride/groom/couple are single slots. */
export type MediaPackRole = "bride" | "groom" | "couple" | "gallery";

export const MEDIA_PACK_ROLES: readonly MediaPackRole[] = [
  "bride",
  "groom",
  "couple",
  "gallery",
];

/** Human labels for the admin UI. */
export const MEDIA_PACK_ROLE_LABELS: Record<MediaPackRole, string> = {
  bride: "Bride photo",
  groom: "Groom photo",
  couple: "Couple photo",
  gallery: "Gallery",
};

/** One photo in a media pack. */
export interface MediaPackItem {
  id: string;
  role: MediaPackRole;
  /** App URL (`/api/media/...`) the browser loads the photo from. */
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  sortOrder: number;
  createdAt: string;
}

/**
 * A pack as shown in the admin tab and the template wizard.
 *
 * `templateCount` is how many templates currently point at this pack; it powers
 * the delete warning. It is not part of the stored row.
 */
export interface MediaPack {
  id: string;
  name: string;
  description: string | null;
  /** Which event form/category this pack belongs to. */
  formType: FormType;
  items: MediaPackItem[];
  templateCount: number;
  createdAt: string;
  updatedAt: string;
}

/** True when a pack is authored for the given event form. */
export function mediaPackMatchesForm(
  pack: { formType: FormType },
  formType: FormType | null | undefined
): boolean {
  return !!formType && pack.formType === formType;
}

// ── Demo detail packs ─────────────────────────────────────────────────────

/** One ceremony/event card inside a demo detail pack. */
export interface DemoDetailPackEvent {
  id: string;
  name: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  address: string | null;
  mapsUrl: string | null;
  description: string | null;
  sortOrder: number;
}

/**
 * A complete set of sample details used to populate a template's demo.
 *
 * The pack's `formType` mirrors the builder form of the category it belongs to.
 * Couple forms use `brideName`/`groomName`; birthday forms use
 * `celebrantName`, and birthday wishes also use `birthdayNumber` and
 * `specialMessage`.
 *
 * Client-safe: the admin manager and the template wizard both type against it
 * without importing the storage-backed service.
 */
export interface DemoDetailPack {
  id: string;
  name: string;
  description: string | null;
  /** Which event form this pack mirrors. */
  formType: FormType;
  brideName: string | null;
  groomName: string | null;
  celebrantName: string | null;
  birthdayNumber: number | null;
  specialMessage: string | null;
  brideDesignation: string | null;
  groomDesignation: string | null;
  brideBio: string | null;
  groomBio: string | null;
  coupleBio: string | null;
  story: string | null;
  weddingDate: string | null;
  weddingTime: string | null;
  venue: string | null;
  address: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  dressBrideColor: string | null;
  dressBrideColorName: string | null;
  dressGroomColor: string | null;
  dressGroomColorName: string | null;
  rsvpDeadline: string | null;
  rsvpContactName: string | null;
  rsvpContactPhone: string | null;
  rsvpWhatsapp: string | null;
  events: DemoDetailPackEvent[];
  templateCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The names shown in admin lists and pickers. Couple forms show "Groom & Bride";
 * birthday forms show the celebrant.
 */
export function demoDetailPackCouple(pack: {
  formType?: FormType;
  brideName: string | null;
  groomName: string | null;
  celebrantName?: string | null;
}): string {
  if (pack.formType && pack.formType !== "wedding" && pack.formType !== "engagement") {
    return pack.celebrantName?.trim() || "Birthday person";
  }
  const groom = pack.groomName?.trim() ?? "";
  const bride = pack.brideName?.trim() ?? "";
  if (groom && bride) return `${groom} & ${bride}`;
  return groom || bride || "Unnamed pack";
}
