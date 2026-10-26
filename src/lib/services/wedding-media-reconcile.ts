import type { Database } from "@/types/database";

import { isLibraryFolder, isWeddingFolder, parseMediaPath } from "./media-access";
import { mediaObjectKey } from "./media-urls";

/**
 * Keeps a published wedding's `wedding_data` consistent when the guest builder
 * keeps autosaving after checkout.
 *
 * Publishing relocates the media out of the guest-draft folder and into the
 * wedding folder. A builder tab that was already open when that happened still
 * holds the old draft-scoped URLs; writing those back to the live invitation
 * would point every guest at objects that no longer exist. This module only
 * accepts media URLs that are safe for the published wedding:
 *
 * * objects in this wedding's own folder,
 * * shared library objects, and
 * * external URLs the couple supplied.
 *
 * A stale draft-scoped URL is replaced with the equivalent already-published
 * URL (matched by slot for portraits, by file name for gallery items), so an
 * old tab cannot roll the live invitation back to broken media.
 *
 * Kept free of server-only imports so the reconciliation rules are unit tested
 * directly.
 */

type JsonRecord = Record<string, unknown>;
type WeddingUpdate = Database["public"]["Tables"]["weddings"]["Update"];

const PORTRAIT_SLOTS = ["bridePhoto", "groomPhoto", "couplePhoto"] as const;

function recordOf(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

/**
 * True when a media URL may be written to a live wedding's data.
 *
 * URLs that are not platform media URLs (external hosts, data URLs) are left
 * alone: the builder never creates them, but notes or future template fields
 * may, and there is no object here to validate.
 */
export function isMediaSafeForLiveWedding(url: unknown, weddingId: string): boolean {
  const key = mediaObjectKey(url);
  if (!key) return true;

  const parsed = parseMediaPath(key.split("/"));
  if (!parsed) return false;
  if (isLibraryFolder(parsed.folder)) return true;
  return isWeddingFolder(parsed.folder) && parsed.folder === weddingId;
}

function galleryItems(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => recordOf(item))
    .filter((item): item is JsonRecord => item !== null && typeof item.url === "string");
}

/** Reconciles every media field, returning a new object. */
export function reconcileMediaForLiveWedding(
  weddingId: string,
  incomingData: unknown,
  existingData: unknown
): JsonRecord {
  const incoming = recordOf(incomingData) ?? {};
  const existing = recordOf(existingData) ?? {};
  const next: JsonRecord = { ...incoming };

  for (const slot of PORTRAIT_SLOTS) {
    if (!(slot in incoming)) {
      // `weddingDataForDb` strips empty fields, so an absent portrait means the
      // couple removed it.
      delete next[slot];
      continue;
    }

    const value = incoming[slot];
    if (value === null || value === "") {
      delete next[slot];
      continue;
    }
    if (isMediaSafeForLiveWedding(value, weddingId)) continue;

    const fallback = existing[slot];
    if (typeof fallback === "string" && fallback && isMediaSafeForLiveWedding(fallback, weddingId)) {
      next[slot] = fallback;
    } else {
      delete next[slot];
    }
  }

  if (!Array.isArray(incoming.gallery)) {
    delete next.gallery;
  } else {
    const published = galleryItems(existing.gallery);
    const byName = new Map<string, JsonRecord>();
    for (const item of published) {
      const name = trimmed(item.name);
      if (name && !byName.has(name)) byName.set(name, item);
    }

    const reconciled: JsonRecord[] = [];
    incoming.gallery.forEach((value, index) => {
      const item = recordOf(value);
      if (!item || typeof item.url !== "string" || !item.url.trim()) return;

      if (isMediaSafeForLiveWedding(item.url, weddingId)) {
        reconciled.push(item);
        return;
      }

      const name = trimmed(item.name);
      let fallback = name ? byName.get(name) : undefined;

      // Older gallery entries may have no name. In that case the same position
      // is the best available match, but only when the incoming item itself is
      // unnamed — a named item that does not match must not silently swap in a
      // different photo.
      if (!fallback && !name) {
        const candidate = published[index];
        if (candidate && typeof candidate.url === "string" && isMediaSafeForLiveWedding(candidate.url, weddingId)) {
          fallback = candidate;
        }
      }

      if (fallback) {
        reconciled.push({ ...item, url: fallback.url });
      }
    });

    if (reconciled.length > 0) next.gallery = reconciled;
    else delete next.gallery;
  }

  if (!("music" in incoming) || incoming.music === null || incoming.music === "") {
    delete next.music;
  } else {
    const item = recordOf(incoming.music);
    if (!item || typeof item.url !== "string" || !item.url.trim()) {
      delete next.music;
    } else if (!isMediaSafeForLiveWedding(item.url, weddingId)) {
      const fallback = recordOf(existing.music);
      if (fallback && typeof fallback.url === "string" && isMediaSafeForLiveWedding(fallback.url, weddingId)) {
        next.music = fallback;
      } else {
        delete next.music;
      }
    }
  }

  return next;
}

/**
 * The top-level `weddings` columns that mirror builder content.
 *
 * Required identity fields are only written when present, so a half-empty
 * autosave cannot blank out a live invitation's name or date. Optional fields
 * deliberately write an empty value as NULL: clearing an address or map link in
 * the builder must clear it on the live invitation too.
 */
export function weddingColumnsFromData(data: unknown): WeddingUpdate {
  const source = recordOf(data) ?? {};
  const columns: WeddingUpdate = {};

  const setRequiredText = (
    key: string,
    column: "bride_name" | "groom_name" | "wedding_date" | "venue"
  ) => {
    const value = trimmed(source[key]);
    if (value) columns[column] = value;
  };

  setRequiredText("brideName", "bride_name");
  setRequiredText("groomName", "groom_name");
  setRequiredText("weddingDate", "wedding_date");
  setRequiredText("venue", "venue");

  if ("weddingTime" in source) columns.wedding_time = trimmed(source.weddingTime);
  if ("address" in source) columns.address = trimmed(source.address);
  if ("mapsUrl" in source) columns.maps_url = trimmed(source.mapsUrl);
  if ("coupleBio" in source) columns.couple_bio = trimmed(source.coupleBio);
  if ("story" in source) columns.story = trimmed(source.story);
  if (typeof source.latitude === "number") columns.latitude = source.latitude;
  else if (source.latitude === null) columns.latitude = null;
  if (typeof source.longitude === "number") columns.longitude = source.longitude;
  else if (source.longitude === null) columns.longitude = null;
  if (typeof source.rsvpEnabled === "boolean") columns.rsvp_toggle = source.rsvpEnabled;

  return columns;
}
