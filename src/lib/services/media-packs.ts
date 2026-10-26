import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_MEDIA_BYTES as CLIENT_MAX_MEDIA_BYTES,
  MEDIA_PACK_ROLES,
  type MediaPack,
  type MediaPackItem,
  type MediaPackRole,
} from "@/lib/library-media";

import { libraryMediaKey } from "./media-access";
import { MAX_IMAGE_BYTES, WEDDING_BUCKET, getObjectStorage } from "./storage";

export type { MediaPack, MediaPackItem, MediaPackRole };

/**
 * Shared media packs: admin-curated sets of sample photos (bride, groom,
 * couple, gallery) that templates render while people preview their demo.
 *
 * Objects live in the private `weddings` bucket under the `library/media/`
 * prefix and are served through /api/media, which re-checks the catalogue row
 * on every request — the same arrangement as the music library.
 *
 * Kept free of server-only imports beyond the storage client so the validation
 * and naming rules can be unit tested directly.
 */

/**
 * Server-enforced size limit.
 *
 * Mirrors the constant the admin uploader shows, which lives in a client-safe
 * module. Asserted equal below so the two cannot drift apart and leave an admin
 * uploading a photo the server then refuses.
 */
export const MAX_MEDIA_PACK_BYTES = MAX_IMAGE_BYTES;

if (CLIENT_MAX_MEDIA_BYTES !== MAX_IMAGE_BYTES) {
  throw new Error(
    `Media pack size limit mismatch: client ${CLIENT_MAX_MEDIA_BYTES} vs server ${MAX_IMAGE_BYTES}`
  );
}

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"] as const;

/** Extensions written per MIME type; WebP is what the optimizer emits. */
const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

interface RawPackRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface RawItemRow {
  id: string;
  pack_id: string;
  role: MediaPackRole;
  public_url: string;
  mime_type: string;
  size_bytes: number | null;
  sort_order: number;
  created_at: string;
}

const PACK_COLUMNS = "id, name, description, created_at, updated_at";
const ITEM_COLUMNS =
  "id, pack_id, role, public_url, mime_type, size_bytes, sort_order, created_at";

function mapPack(row: RawPackRow): Omit<MediaPack, "items" | "templateCount"> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: RawItemRow): MediaPackItem {
  return {
    id: row.id,
    role: row.role,
    url: row.public_url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/**
 * Raised for a rejected admin input; `code` lets the API answer a precise
 * status without parsing messages.
 */
export class MediaPackValidationError extends Error {
  constructor(
    readonly code:
      | "UNSUPPORTED_FILE_TYPE"
      | "FILE_TOO_LARGE"
      | "MISSING_FILE"
      | "INVALID_NAME"
      | "INVALID_ROLE",
    message: string
  ) {
    super(message);
    this.name = "MediaPackValidationError";
  }
}

function ascii8(head: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...head.slice(start, end));
}

/** Magic bytes that identify a format that is definitively not an image. */
const NON_IMAGE_SIGNATURES: ReadonlyArray<{
  label: string;
  matches: (head: Uint8Array, ascii: (start: number, end: number) => string) => boolean;
}> = [
  { label: "PDF", matches: (_, ascii) => ascii(0, 5) === "%PDF-" },
  {
    label: "ZIP",
    matches: (h) => h[0] === 0x50 && h[1] === 0x4b && (h[2] === 0x03 || h[2] === 0x05 || h[2] === 0x07),
  },
  { label: "ELF", matches: (h) => h[0] === 0x7f && h[1] === 0x45 && h[2] === 0x4c && h[3] === 0x46 },
  { label: "gzip", matches: (h) => h[0] === 0x1f && h[1] === 0x8b },
  { label: "Mach-O", matches: (h) => h[0] === 0xfe && h[1] === 0xed && h[2] === 0xfa },
  // Audio/video containers that share no prefix with any image format.
  { label: "WAVE audio", matches: (_, ascii) => ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE" },
  // Shared by MP4/MOV/HEIC *and* AVIF; the brand decides. `sniffImageMime`
  // claims AVIF before this list is consulted, so a bare "ftyp" here only
  // rejects the containers no image format uses.
  { label: "ISO media", matches: (_, ascii) => ascii(4, 8) === "ftyp" },
  { label: "Ogg", matches: (_, ascii) => ascii(0, 4) === "OggS" },
  { label: "FLAC", matches: (_, ascii) => ascii(0, 4) === "fLaC" },
  { label: "MP3/ID3", matches: (_, ascii) => ascii(0, 3) === "ID3" },
];

/** True when the bytes carry a signature that is definitely not an image. */
export function looksLikeNonImage(head: Uint8Array): boolean {
  const ascii = (start: number, end: number): string => ascii8(head, start, end);
  return NON_IMAGE_SIGNATURES.some((sig) => sig.matches(head, ascii));
}

/**
 * Magic-byte sniffing for images.
 *
 * Returns null for anything unrecognized *and* for a known non-image format, so
 * the caller's fallback to the declared MIME type can never admit a file whose
 * bytes are visibly something else.
 */
export function sniffImageMime(head: Uint8Array): string | null {
  const len = head.length;
  if (
    len >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return "image/png";
  }
  if (len >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (len >= 4 && ascii8(head, 0, 4) === "GIF8") return "image/gif";
  if (len >= 12 && ascii8(head, 0, 4) === "RIFF" && ascii8(head, 8, 12) === "WEBP") {
    return "image/webp";
  }
  // AVIF (and its animated sibling AVIS) is ISO-BMFF — the same "ftyp" box
  // family that is otherwise audio/video. The brand tells them apart: the
  // still brand "avif" or sequence brand "avis" sits at offset 8, but some
  // encoders write a MIAF major brand and only list "avif" among the
  // compatible brands, which start at offset 16. Brands are 4-byte aligned,
  // so the whole header is walked in 4-byte steps.
  if (len >= 12 && ascii8(head, 4, 8) === "ftyp") {
    for (let at = 8; at + 4 <= len; at += 4) {
      const brand = ascii8(head, at, at + 4);
      if (brand === "avif" || brand === "avis") return "image/avif";
    }
  }
  return null;
}

export interface ValidatedMediaUpload {
  mimeType: string;
  ext: string;
  sizeBytes: number;
}

/** Validates an admin photo upload against the sniffed type, never the client's. */
export function validateMediaPackUpload(input: {
  buffer: ArrayBuffer;
  declaredType: string;
  /** Kept for call-site parity with the music validator; the sniff wins. */
  originalName?: string;
}): ValidatedMediaUpload {
  const size = input.buffer.byteLength;
  if (size === 0) throw new MediaPackValidationError("MISSING_FILE", "Empty file");
  if (size > MAX_MEDIA_PACK_BYTES) {
    throw new MediaPackValidationError(
      "FILE_TOO_LARGE",
      `Photo must be ${Math.floor(MAX_MEDIA_PACK_BYTES / (1024 * 1024))}MB or smaller`
    );
  }

  // 64 bytes rather than the 16 a bare signature needs: an AVIF's compatible
  // brand list starts at offset 16, so a header truncated there could miss the
  // "avif" brand and fall through to the generic ISO-media rejection.
  const head = new Uint8Array(input.buffer.slice(0, 64));
  const sniffed = sniffImageMime(head);
  const declared = input.declaredType.split(";")[0].trim().toLowerCase();

  // Prefer the sniffed type. The declared type is only consulted when the bytes
  // were inconclusive, and never for a file whose bytes identify some other
  // format.
  const mimeType =
    sniffed ??
    (!looksLikeNonImage(head) && (IMAGE_MIME_TYPES as readonly string[]).includes(declared)
      ? declared
      : null);
  if (!mimeType) {
    throw new MediaPackValidationError("UNSUPPORTED_FILE_TYPE", "Unsupported image format");
  }

  return { mimeType, ext: EXT_FOR_MIME[mimeType] ?? "bin", sizeBytes: size };
}

export function normalizePackName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 1) throw new MediaPackValidationError("INVALID_NAME", "Pack name is required");
  return name.slice(0, 120);
}

export function normalizePackDescription(raw: unknown): string | null {
  const description = typeof raw === "string" ? raw.trim() : "";
  return description.length > 0 ? description.slice(0, 300) : null;
}

export function normalizePackRole(raw: unknown): MediaPackRole {
  const role = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!(MEDIA_PACK_ROLES as readonly string[]).includes(role)) {
    throw new MediaPackValidationError("INVALID_ROLE", "Unknown media role");
  }
  return role as MediaPackRole;
}

/**
 * Monotonic-ish sort key for a new item.
 *
 * Millisecond time alone could tie for two photos uploaded in the same tick;
 * the random tail keeps "newest" well defined for the single-photo slots.
 */
function nextSortOrder(): number {
  return (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1000);
}

/** Lists every pack with its photos and how many templates use it. */
export async function listMediaPacks(): Promise<MediaPack[]> {
  const admin = createAdminClient();
  const [packsRes, itemsRes, templatesRes] = await Promise.all([
    admin.from("media_packs").select(PACK_COLUMNS).order("created_at", { ascending: false }),
    admin.from("media_pack_items").select(ITEM_COLUMNS).order("sort_order", { ascending: true }),
    // Best-effort usage count: a failed read degrades to "0 templates", which
    // only softens the delete warning.
    admin.from("templates").select("media_pack_id").not("media_pack_id", "is", null),
  ]);

  if (packsRes.error) throw new Error(packsRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const itemsByPack = new Map<string, MediaPackItem[]>();
  for (const row of (itemsRes.data ?? []) as unknown as RawItemRow[]) {
    const list = itemsByPack.get(row.pack_id) ?? [];
    list.push(mapItem(row));
    itemsByPack.set(row.pack_id, list);
  }

  const counts = new Map<string, number>();
  for (const row of (templatesRes.data ?? []) as Array<{ media_pack_id: string | null }>) {
    if (!row.media_pack_id) continue;
    counts.set(row.media_pack_id, (counts.get(row.media_pack_id) ?? 0) + 1);
  }

  return ((packsRes.data ?? []) as unknown as RawPackRow[]).map((row) => ({
    ...mapPack(row),
    items: itemsByPack.get(row.id) ?? [],
    templateCount: counts.get(row.id) ?? 0,
  }));
}

export async function createMediaPack(input: {
  name: unknown;
  description: unknown;
}): Promise<MediaPack> {
  const name = normalizePackName(input.name);
  const description = normalizePackDescription(input.description);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("media_packs")
    .insert({ name, description })
    .select(PACK_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  return { ...mapPack(data as unknown as RawPackRow), items: [], templateCount: 0 };
}

export async function updateMediaPack(
  id: string,
  input: { name?: unknown; description?: unknown }
): Promise<void> {
  const update: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) update.name = normalizePackName(input.name);
  if (input.description !== undefined) update.description = normalizePackDescription(input.description);
  if (Object.keys(update).length === 0) {
    throw new MediaPackValidationError("INVALID_NAME", "Nothing to update");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("media_packs").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Removes a pack, its photo rows (cascade) and its objects.
 *
 * Templates pointing at the pack are detached by the FK (`on delete set null`)
 * and fall back to the images bundled in their package. Rows go first: once
 * they are gone the objects are unreachable through /api/media, so deleting
 * them is best-effort cleanup rather than a correctness requirement.
 */
export async function deleteMediaPack(id: string): Promise<{ removedObjects: number }> {
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("media_packs")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!existing) throw new Error("Media pack not found");

  const { data: items, error: itemsError } = await admin
    .from("media_pack_items")
    .select("storage_key")
    .eq("pack_id", id);
  if (itemsError) throw new Error(itemsError.message);

  // Objects first: if B2 fails, the pack rows survive and a retry can finish
  // the job. Deleting rows first made failures unrecoverable and left orphaned
  // photos in the bucket with nothing pointing at them.
  const storage = await getObjectStorage();
  let removedObjects = 0;
  for (const item of (items ?? []) as Array<{ storage_key: string }>) {
    await storage.delete(WEDDING_BUCKET, item.storage_key);
    removedObjects += 1;
  }

  // Be explicit instead of relying only on the FK cascade, so the template
  // purge leaves no pack-item rows behind even on older schemas.
  const { error: itemsDeleteError } = await admin
    .from("media_pack_items")
    .delete()
    .eq("pack_id", id);
  if (itemsDeleteError) throw new Error(itemsDeleteError.message);

  const { error } = await admin.from("media_packs").delete().eq("id", id);
  if (error) throw new Error(error.message);

  return { removedObjects };
}

/**
 * Uploads a photo into a pack and records the row.
 *
 * bride/groom/couple replace: after the new photo is safely stored and
 * recorded, every older row for that role is removed. Gallery accumulates.
 */
export async function uploadMediaPackItem(input: {
  packId: string;
  role: MediaPackRole;
  buffer: ArrayBuffer;
  declaredType: string;
  originalName: string;
  randomSuffix: string;
}): Promise<MediaPackItem> {
  const validated = validateMediaPackUpload(input);

  const admin = createAdminClient();
  const { data: pack, error: packError } = await admin
    .from("media_packs")
    .select("id")
    .eq("id", input.packId)
    .maybeSingle();
  if (packError) throw new Error(packError.message);
  if (!pack) throw new Error("Media pack not found");

  const optimized = await optimizeImage(input.buffer, validated);

  const key = libraryMediaKey(`photo-${input.randomSuffix}`, optimized.ext);
  const storage = await getObjectStorage();
  await storage.upload(WEDDING_BUCKET, key, optimized.body, {
    contentType: optimized.mimeType,
    cacheControl: "3600",
  });

  const { data, error } = await admin
    .from("media_pack_items")
    .insert({
      pack_id: input.packId,
      role: input.role,
      storage_key: key,
      public_url: `/api/media/${key}`,
      mime_type: optimized.mimeType,
      size_bytes: optimized.body.length,
      sort_order: nextSortOrder(),
    })
    .select(ITEM_COLUMNS)
    .single();

  if (error) {
    // Never leave an orphaned object behind if the row could not be written.
    await storage.delete(WEDDING_BUCKET, key).catch(() => {});
    throw new Error(error.message);
  }

  const item = mapItem(data as unknown as RawItemRow);

  if (input.role !== "gallery") {
    const { data: previous } = await admin
      .from("media_pack_items")
      .select("id, storage_key")
      .eq("pack_id", input.packId)
      .eq("role", input.role)
      .neq("id", item.id);

    const stale = (previous ?? []) as Array<{ id: string; storage_key: string }>;
    if (stale.length > 0) {
      await admin.from("media_pack_items").delete().in("id", stale.map((row) => row.id));
      for (const row of stale) {
        await storage.delete(WEDDING_BUCKET, row.storage_key).catch(() => {});
      }
    }
  }

  return item;
}

/** Removes one photo row and its object. */
export async function deleteMediaPackItem(packId: string, itemId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("media_pack_items")
    .select("id, storage_key")
    .eq("id", itemId)
    .eq("pack_id", packId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Photo not found");

  // Delete the object first so a B2 failure leaves the row in place for a
  // retry instead of orphaning an unreachable image.
  await (await getObjectStorage()).delete(
    WEDDING_BUCKET,
    data.storage_key as string
  );

  const { error: deleteError } = await admin.from("media_pack_items").delete().eq("id", itemId);
  if (deleteError) throw new Error(deleteError.message);
}

/**
 * Server-side image pipeline: EXIF rotation, max dimensions and WebP, matching
 * the wedding-media rules — JPEG, PNG, WebP and AVIF all come out as WebP.
 * GIFs are stored as-is because animating them through the raster pipeline
 * would flatten them; any optimizer failure (e.g. an unreadable AVIF on a
 * build without libheif) falls back to the raw bytes rather than rejecting
 * the upload.
 */
async function optimizeImage(
  buffer: ArrayBuffer,
  validated: ValidatedMediaUpload
): Promise<{ body: Buffer; mimeType: string; ext: string }> {
  if (validated.mimeType === "image/gif") {
    return { body: Buffer.from(buffer), mimeType: validated.mimeType, ext: validated.ext };
  }

  try {
    const sharp = (await import("sharp")).default;
    const body = await sharp(Buffer.from(buffer))
      .rotate()
      .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
    return { body, mimeType: "image/webp", ext: "webp" };
  } catch (err) {
    console.warn("[media-packs] Image optimization fallback to raw buffer:", err);
    return { body: Buffer.from(buffer), mimeType: validated.mimeType, ext: validated.ext };
  }
}

/**
 * Demo media a pack contributes to a template preview.
 *
 * Only the newest photo per single slot is used; the gallery keeps upload
 * order. Pure so the selection rules can be unit tested without storage.
 */
export interface PackDemoMedia {
  photos: { bride: string | null; groom: string | null; couple: string | null };
  gallery: Array<{ url: string }>;
}

export function buildPackDemoMedia(
  items: ReadonlyArray<Pick<MediaPackItem, "role" | "url" | "sortOrder">>
): PackDemoMedia {
  const newest = (role: MediaPackRole): string | null => {
    let best: { url: string; sortOrder: number } | null = null;
    for (const item of items) {
      if (item.role !== role) continue;
      if (!best || item.sortOrder >= best.sortOrder) best = item;
    }
    return best?.url ?? null;
  };

  const gallery = items
    .filter((item) => item.role === "gallery")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({ url: item.url }));

  return {
    photos: { bride: newest("bride"), groom: newest("groom"), couple: newest("couple") },
    gallery,
  };
}

/**
 * Pack media for rendering a demo, or null when the pack is missing or empty,
 * so callers keep the stock demo data.
 */
export async function getPackDemoMedia(packId: string): Promise<PackDemoMedia | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("media_pack_items")
    .select(ITEM_COLUMNS)
    .eq("pack_id", packId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const items = ((data ?? []) as unknown as RawItemRow[]).map(mapItem);
  if (items.length === 0) return null;
  return buildPackDemoMedia(items);
}
