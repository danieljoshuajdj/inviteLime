import { createAdminClient } from "@/lib/supabase/admin";
import type { MusicTrack, MusicTrackCategory } from "@/lib/library-media";

import { MAX_MUSIC_BYTES as CLIENT_MAX_MUSIC_BYTES, UUID_RE, libraryMusicKey } from "./media-access";
import { MAX_AUDIO_BYTES, WEDDING_BUCKET, getObjectStorage } from "./storage";

export type { MusicTrack, MusicTrackCategory };


/**
 * Shared music library: admin-uploaded audio a guest can choose instead of
 * supplying their own file.
 *
 * Kept free of server-only imports beyond the storage client so the validation
 * and naming rules can be unit tested directly.
 */

export const MUSIC_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/opus",
  "audio/flac",
] as const;

/** Extensions written per MIME type; mp3 is the most browser-portable choice. */
const EXT_FOR_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

/**
 * Server-enforced size limit.
 *
 * Mirrors the constant the admin uploader shows, which lives in a client-safe
 * module. Asserted equal below so the two cannot drift apart and leave an admin
 * uploading a file the server then refuses.
 */
export const MAX_MUSIC_BYTES = MAX_AUDIO_BYTES;

// The client and the server must agree on the limit; see MAX_MUSIC_BYTES.
if (CLIENT_MAX_MUSIC_BYTES !== MAX_AUDIO_BYTES) {
  throw new Error(
    `Music size limit mismatch: client ${CLIENT_MAX_MUSIC_BYTES} vs server ${MAX_AUDIO_BYTES}`
  );
}

interface RawTrackRow {
  id: string;
  title: string;
  artist: string | null;
  public_url: string;
  mime_type: string;
  size_bytes: number | null;
  duration_ms: number | null;
  is_active: boolean;
  created_at: string;
}

interface RawTrackCategoryRow {
  music_track_id: string;
  category_id: string;
}

interface RawCategoryRow {
  id: string;
  name: string;
  slug: string;
}

function mapCategory(row: RawCategoryRow): MusicTrackCategory {
  return { id: row.id, name: row.name, slug: row.slug };
}

function mapTrack(row: RawTrackRow, categories: MusicTrackCategory[]): MusicTrack {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    url: row.public_url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationMs: row.duration_ms,
    isActive: row.is_active,
    categories,
    createdAt: row.created_at,
  };
}

const COLUMNS =
  "id, title, artist, public_url, mime_type, size_bytes, duration_ms, is_active, created_at";

/** Categories for the given track ids, grouped by track. */
async function categoriesByTrack(
  trackIds: string[]
): Promise<Map<string, MusicTrackCategory[]>> {
  const grouped = new Map<string, MusicTrackCategory[]>();
  if (trackIds.length === 0) return grouped;

  const admin = createAdminClient();
  const { data: links, error: linkError } = await admin
    .from("music_track_categories")
    .select("music_track_id, category_id")
    .in("music_track_id", trackIds);
  if (linkError) throw new Error(linkError.message);

  const categoryIds = Array.from(
    new Set(((links ?? []) as RawTrackCategoryRow[]).map((link) => link.category_id))
  );
  if (categoryIds.length === 0) return grouped;

  const { data: categoryRows, error: categoryError } = await admin
    .from("categories")
    .select("id, name, slug")
    .in("id", categoryIds);
  if (categoryError) throw new Error(categoryError.message);

  const categories = new Map(
    ((categoryRows ?? []) as RawCategoryRow[]).map((row) => [row.id, mapCategory(row)])
  );

  for (const link of (links ?? []) as RawTrackCategoryRow[]) {
    const category = categories.get(link.category_id);
    if (!category) continue;
    const list = grouped.get(link.music_track_id) ?? [];
    list.push(category);
    grouped.set(link.music_track_id, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

/**
 * Validates an admin category selection: at least one real category, no
 * duplicates. Returns the stored category rows in name order.
 */
export async function resolveMusicCategories(raw: unknown): Promise<MusicTrackCategory[]> {
  const values = Array.isArray(raw) ? raw : [];
  const ids = Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === "string" && UUID_RE.test(value.trim())
      ).map((value) => value.trim())
    )
  );
  if (ids.length === 0) {
    throw new MusicValidationError("INVALID_CATEGORY", "Select at least one category");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("categories").select("id, name, slug").in("id", ids);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RawCategoryRow[];
  if (rows.length !== ids.length) {
    throw new MusicValidationError(
      "INVALID_CATEGORY",
      "One or more selected categories no longer exist"
    );
  }
  return rows.map(mapCategory).sort((a, b) => a.name.localeCompare(b.name));
}


/** Magic bytes that identify a format that is definitively not audio. */
const NON_AUDIO_SIGNATURES: ReadonlyArray<{
  label: string;
  matches: (head: Uint8Array, ascii: (start: number, end: number) => string) => boolean;
}> = [
  { label: "PNG", matches: (h) => h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47 },
  { label: "JPEG", matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { label: "GIF", matches: (h) => ascii8(h, 0, 4) === "GIF8" },
  {
    label: "WebP",
    matches: (h, ascii) => ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP",
  },
  { label: "PDF", matches: (h, ascii) => ascii(0, 5) === "%PDF-" },
  { label: "ZIP", matches: (h) => h[0] === 0x50 && h[1] === 0x4b && (h[2] === 0x03 || h[2] === 0x05) },
  { label: "ELF", matches: (h) => h[0] === 0x7f && h[1] === 0x45 && h[2] === 0x4c && h[3] === 0x46 },
  { label: "gzip", matches: (h) => h[0] === 0x1f && h[1] === 0x8b },
  { label: "Mach-O", matches: (h) => h[0] === 0xfe && h[1] === 0xed && h[2] === 0xfa },
];

function ascii8(head: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...head.slice(start, end));
}

/** True when the bytes carry a signature that is definitely not audio. */
export function looksLikeNonAudio(head: Uint8Array): boolean {
  const ascii = (start: number, end: number): string => ascii8(head, start, end);
  return NON_AUDIO_SIGNATURES.some((sig) => sig.matches(head, ascii));
}

/**
 * Magic-byte sniffing for audio.
 *
 * Returns null for anything unrecognized *and* for a known non-audio format, so
 * the caller's fallback to the declared MIME type can never admit a file whose
 * bytes are visibly something else.
 */
export function sniffAudioMime(head: Uint8Array): string | null {
  if (looksLikeNonAudio(head)) return null;

  const len = head.length;
  const ascii = (start: number, end: number): string =>
    String.fromCharCode(...head.slice(start, end));

  // ID3 tag.
  if (len >= 3 && ascii(0, 3) === "ID3") return "audio/mpeg";

  // Frame sync (11 set bits) followed by the layer field.
  // ADTS AAC frames share the 0xFFF leading sync but always set layer === 00,
  // which MPEG-1/2 audio never does. That layer value is the reliable
  // discriminator, so it is checked before interpreting the version bits.
  if (len >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    const layer = (head[1] >> 1) & 0x03;
    if (layer === 0x00) return "audio/aac"; // ADTS AAC sync word
    const version = (head[1] >> 2) & 0x03;
    if (version === 0x01) return null; // reserved version
    return "audio/mpeg";
  }

  // RIFF/WAVE and RF64.
  if (len >= 12 && ascii(0, 4) === "RIFF") {
    const form = ascii(8, 12);
    if (form === "WAVE") return "audio/wav";
    if (form === "WEBP") return null; // an image, despite any audio name
    return "audio/wav";
  }
  if (len >= 4 && ascii(0, 4) === "RF64") return "audio/wav";

  // fLaC, OggS (Vorbis/Opus/FLAC all ship in an Ogg container).
  if (len >= 4 && ascii(0, 4) === "fLaC") return "audio/flac";
  if (len >= 4 && ascii(0, 4) === "OggS") return "audio/ogg";

  // ISO base media (AAC/MP4).
  if (len >= 12 && ascii(4, 8) === "ftyp") return "audio/aac";
  if (len >= 12 && ascii(4, 8) === "moov") return "audio/aac";

  return null;
}

/** Raised for a rejected upload or category selection; `code` maps onto an HTTP status. */
export class MusicValidationError extends Error {
  constructor(
    readonly code:
      | "UNSUPPORTED_FILE_TYPE"
      | "FILE_TOO_LARGE"
      | "MISSING_FILE"
      | "INVALID_TITLE"
      | "INVALID_CATEGORY",
    message: string
  ) {
    super(message);
    this.name = "MusicValidationError";
  }
}

export interface ValidatedMusicUpload {
  mimeType: string;
  ext: string;
  sizeBytes: number;
}

/**
 * Validates an admin music upload against the sniffed type, never the client's
 * declared one.
 */
export function validateMusicUpload(input: {
  buffer: ArrayBuffer;
  declaredType: string;
  originalName: string;
}): ValidatedMusicUpload {
  const size = input.buffer.byteLength;
  if (size === 0) throw new MusicValidationError("MISSING_FILE", "Empty file");
  if (size > MAX_MUSIC_BYTES) {
    throw new MusicValidationError(
      "FILE_TOO_LARGE",
      `Audio must be ${Math.floor(MAX_MUSIC_BYTES / (1024 * 1024))}MB or smaller`
    );
  }

  const head = new Uint8Array(input.buffer.slice(0, 32));
  const sniffed = sniffAudioMime(head);
  const declared = input.declaredType.split(";")[0].trim().toLowerCase();

  // Prefer the sniffed type. The declared type is only consulted when the bytes
  // were inconclusive (a bare ADTS stream has no container header), and never
  // for a file whose bytes identify some other format.
  const mimeType =
    sniffed ??
    (!looksLikeNonAudio(head) && (MUSIC_MIME_TYPES as readonly string[]).includes(declared)
      ? declared
      : null);
  if (!mimeType) throw new MusicValidationError("UNSUPPORTED_FILE_TYPE", "Unsupported audio format");

  return { mimeType, ext: EXT_FOR_MIME[mimeType] ?? "mp3", sizeBytes: size };
}

export function normalizeTitle(raw: unknown): string {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (title.length < 1) throw new MusicValidationError("INVALID_TITLE", "Title is required");
  return title.slice(0, 120);
}

export function normalizeArtist(raw: unknown): string | null {
  const artist = typeof raw === "string" ? raw.trim() : "";
  return artist.length > 0 ? artist.slice(0, 120) : null;
}

/**
 * Builds the storage key for a new library track.
 *
 * A short random suffix keeps two uploads of the same title from colliding and
 * stops the key from leaking the title into a storage path.
 */
export function musicKeyFor(randomSuffix: string, ext: string): string {
  return libraryMusicKey(`track-${randomSuffix}`, ext);
}

/** Lists library tracks. `includeHidden` is for the admin view only. */
export async function listMusicTracks(
  includeHidden = false,
  filter?: { categorySlug?: string | null }
): Promise<MusicTrack[]> {
  const admin = createAdminClient();
  let query = admin.from("music_tracks").select(COLUMNS).order("title");
  if (!includeHidden) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RawTrackRow[];
  const grouped = await categoriesByTrack(rows.map((row) => row.id));
  const tracks = rows.map((row) => mapTrack(row, grouped.get(row.id) ?? []));

  const categorySlug = filter?.categorySlug;
  if (!categorySlug) return tracks;
  return tracks.filter((track) =>
    track.categories.some((category) => category.slug === categorySlug)
  );
}

/**
 * One track by id, for a template's assigned demo song.
 *
 * Deliberately ignores `is_active`: hiding a track only removes it from the
 * customer-facing picker, while templates already assigned to it keep working.
 */
export async function getMusicTrack(id: string): Promise<MusicTrack | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("music_tracks")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const grouped = await categoriesByTrack([id]);
  return mapTrack(data as unknown as RawTrackRow, grouped.get(id) ?? []);
}

/** Uploads an object into the library folder and records the row. */
export async function createMusicTrack(input: {
  buffer: ArrayBuffer;
  declaredType: string;
  originalName: string;
  title: string;
  artist: string | null;
  durationMs: number | null;
  categoryIds: unknown;
  randomSuffix: string;
}): Promise<MusicTrack> {
  const validated = validateMusicUpload(input);
  // Resolve categories before writing the object so a bad selection cannot
  // leave an orphaned upload behind.
  const categories = await resolveMusicCategories(input.categoryIds);

  const key = musicKeyFor(input.randomSuffix, validated.ext);
  const body = Buffer.from(input.buffer);

  const storage = await getObjectStorage();
  await storage.upload(WEDDING_BUCKET, key, body, {
    contentType: validated.mimeType,
    // The key carries a random suffix, so a retry cannot overwrite a track that
    // was already created under a different suffix.
    cacheControl: "3600",
  });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("music_tracks")
    .insert({
      title: input.title,
      artist: input.artist,
      storage_key: key,
      public_url: `/api/media/${key}`,
      mime_type: validated.mimeType,
      size_bytes: validated.sizeBytes,
      duration_ms: input.durationMs,
      is_active: true,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // Never leave an orphaned object behind if the row could not be written.
    await storage.delete(WEDDING_BUCKET, key).catch(() => {});
    throw new Error(error.message);
  }

  const { error: categoryError } = await admin
    .from("music_track_categories")
    .insert(categories.map((category) => ({ music_track_id: data.id, category_id: category.id })));

  if (categoryError) {
    // Roll back both the row and the object: a track with no category would be
    // invisible everywhere.
    await admin.from("music_tracks").delete().eq("id", data.id);
    await storage.delete(WEDDING_BUCKET, key).catch(() => {});
    throw new Error(categoryError.message);
  }

  return mapTrack((data as unknown) as RawTrackRow, categories);
}

/**
 * Replaces a track's category assignments.
 *
 * New links are written before old ones are removed, so a failed write cannot
 * leave the track with no categories.
 */
export async function setMusicTrackCategories(id: string, categoryIds: unknown): Promise<void> {
  const categories = await resolveMusicCategories(categoryIds);
  const admin = createAdminClient();

  const { data: track, error: trackError } = await admin
    .from("music_tracks")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (trackError) throw new Error(trackError.message);
  if (!track) throw new Error("Track not found");

  const ids = categories.map((category) => category.id);
  const { error: upsertError } = await admin
    .from("music_track_categories")
    .upsert(
      ids.map((categoryId) => ({ music_track_id: id, category_id: categoryId })),
      { onConflict: "music_track_id,category_id" }
    );
  if (upsertError) throw new Error(upsertError.message);

  const { error: pruneError } = await admin
    .from("music_track_categories")
    .delete()
    .eq("music_track_id", id)
    .not("category_id", "in", `(${ids.join(",")})`);
  if (pruneError) throw new Error(pruneError.message);
}

/** Toggles whether a track is offered to guests. */
export async function setMusicTrackActive(id: string, isActive: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("music_tracks").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Removes a track row and its object.
 *
 * Weddings that picked this track already hold their own copy in the wedding
 * folder, so deleting the library object cannot break a published invitation.
 */
export async function deleteMusicTrack(id: string): Promise<{ removedObject: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("music_tracks")
    .select("id, storage_key")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Track not found");

  const storage = await getObjectStorage();
  await storage.delete(WEDDING_BUCKET, data.storage_key as string);

  const { error: deleteError } = await admin.from("music_tracks").delete().eq("id", id);
  if (deleteError) {
    // Put the object back so the surviving row is not left pointing at nothing.
    await storage.upload(WEDDING_BUCKET, data.storage_key as string, Buffer.alloc(0)).catch(() => {});
    throw new Error(deleteError.message);
  }

  return { removedObject: true };
}