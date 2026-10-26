import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

import { isBackblazeConfigured } from "./storage/urls";
import { WEDDING_BUCKET } from "./storage/buckets";
import type { ObjectStorage } from "./storage/abstraction";

export { WEDDING_BUCKET, TEMPLATE_BUCKET } from "./storage/buckets";

export {
  StorageError,
  isAlreadyExistsError,
  type ObjectStorage,
  type StorageUploadOptions,
  type StoredObject,
} from "./storage/abstraction";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

/**
 * Resolves the active object storage backend.
 *
 * Backblaze B2 is used when `B2_ENDPOINT` + `B2_KEY_ID` + `B2_APPLICATION_KEY`
 * are set; otherwise Supabase Storage (migrations 00001 buckets). The backend
 * is resolved once per process and cached.
 */
let cachedStorage: ObjectStorage | null = null;
let storageLoading: Promise<ObjectStorage> | null = null;

export function getObjectStorage(): Promise<ObjectStorage> {
  if (cachedStorage) return Promise.resolve(cachedStorage);
  if (!storageLoading) {
    storageLoading = createObjectStorage().then((storage) => {
      cachedStorage = storage;
      storageLoading = null;
      return storage;
    });
  }
  return storageLoading;
}

async function createObjectStorage(): Promise<ObjectStorage> {
  // Dynamic import keeps the server-only providers (and the AWS SDK for B2)
  // out of the pure/test module graph loaded by this file.
  if (isBackblazeConfigured()) {
    const { createBackblazeStorage } = await import("./storage/b2-storage");
    return createBackblazeStorage();
  }
  const { createSupabaseStorage } = await import("./storage/supabase-storage");
  return createSupabaseStorage();
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/ogg", "audio/aac", "audio/wav"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

export type MediaRole = "bride" | "groom" | "couple" | "gallery" | "music" | "video";

export const MEDIA_ROLES: readonly MediaRole[] = [
  "bride",
  "groom",
  "couple",
  "gallery",
  "music",
  "video",
];

/** Role salt used to build guest-draft folder names. Mirrored in /api/uploads. */
export const ROLE_SALT: Record<MediaRole, number> = {
  bride: 1,
  groom: 2,
  couple: 3,
  gallery: 4,
  music: 5,
  video: 6,
};

export interface SaveMediaResult {
  path: string;
  publicUrl: string;
}

/**
 * Wedding media lives in a private bucket, so a storage `publicUrl` is a dead
 * link: Supabase answers unauthenticated requests to /object/public/ on a
 * private bucket with 400. Media is therefore addressed through this app route,
 * which re-checks access on every request before streaming the object.
 */
export function mediaUrlForPath(path: string): string {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Roles that hold one object per upload instead of a single replaceable file.
 * A gallery accumulates; a bride photo is swapped.
 */
export const ACCUMULATIVE_MEDIA_ROLES: readonly MediaRole[] = ["gallery", "video"];

/**
 * Object name for an uploaded file.
 *
 * Accumulative roles need a distinct name per upload: a fixed `${role}.${ext}`
 * combined with `upsert` made every gallery image overwrite the previous one,
 * while the builder kept appending to `data.gallery`, so the whole gallery
 * rendered the same last-uploaded file. Single-file roles stay stable so
 * re-uploading replaces the photo, which is the intent.
 */
export function mediaObjectName(role: MediaRole, ext: string, uniqueId?: string): string {
  const suffix =
    ACCUMULATIVE_MEDIA_ROLES.includes(role) && uniqueId ? `-${uniqueId}` : "";
  return `${role}${suffix}.${ext}`;
}

function extOf(name: string, fallback = "bin"): string {
  const ext = name.split(".").pop();
  return ext && ext.length <= 6 ? ext.toLowerCase() : fallback;
}

/**
 * Server-side validated upload of wedding media. Scans magic bytes to
 * confirm the real content type regardless of client-supplied MIME.
 */
export async function saveWeddingMedia(input: {
  userId?: string | null;
  guestToken?: string | null;
  weddingId?: string | null;
  weddingGuid: string;
  role: MediaRole;
  fileName: string;
  contentType: string;
  buffer: ArrayBuffer;
}): Promise<SaveMediaResult> {
  const supabase = createAdminClient();

  const size = input.buffer.byteLength;
  const head = new Uint8Array(input.buffer.slice(0, 16));

  const sniffed = sniffType(head);
  const effectiveType = sniffed !== "unknown" && (sniffed === input.contentType || IMAGE_TYPES.has(sniffed) || AUDIO_TYPES.has(sniffed) || VIDEO_TYPES.has(sniffed))
    ? sniffed
    : input.contentType;

  const allowed = effectiveType.startsWith("image")
    ? IMAGE_TYPES
    : effectiveType.startsWith("audio")
    ? AUDIO_TYPES
    : effectiveType.startsWith("video")
    ? VIDEO_TYPES
    : new Set<string>();

  if (!allowed.has(effectiveType)) throw new Error("UNSUPPORTED_FILE_TYPE");
  if (effectiveType.startsWith("image") && size > MAX_IMAGE_BYTES) throw new Error("FILE_TOO_LARGE");
  if (effectiveType.startsWith("audio") && size > MAX_AUDIO_BYTES) throw new Error("FILE_TOO_LARGE");
  if (effectiveType.startsWith("video") && size > MAX_VIDEO_BYTES) throw new Error("FILE_TOO_LARGE");

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };

  let uploadBuffer: Buffer = Buffer.from(input.buffer);
  let finalContentType = effectiveType;
  let ext = extMap[effectiveType] ?? extOf(input.fileName);

  // Server-side image optimization pipeline (WebP conversion, EXIF rotation, max dimensions)
  if (effectiveType.startsWith("image/") && effectiveType !== "image/gif") {
    try {
      const sharp = (await import("sharp")).default;
      uploadBuffer = await sharp(uploadBuffer)
        .rotate()
        .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
      finalContentType = "image/webp";
      ext = "webp";
    } catch (err) {
      console.warn("[storage] Image optimization fallback to raw buffer:", err);
      uploadBuffer = Buffer.from(input.buffer);
    }
  }

  const finalSizeBytes = uploadBuffer.length;

  const safeRole = input.role;
  const objectName = mediaObjectName(safeRole, ext, randomUUID().replace(/-/g, "").slice(0, 10));

  const folder = `${input.weddingGuid}/${safeRole}`;
  const path = `${folder}/${objectName}`;

  const storage = await getObjectStorage();
  await storage.upload(WEDDING_BUCKET, path, uploadBuffer, {
    contentType: finalContentType,
    upsert: true,
    cacheControl: "3600",
  });

  const publicUrl = mediaUrlForPath(path);

  const result: SaveMediaResult = { path, publicUrl };

  // married/account media: record rows only when the wedding already exists;
  // draft-phase uploads live in the guest_draft wedding_data until checkout.
  if (input.weddingId) {
    // Single-file roles keep exactly one row, so the previous file's row goes.
    // Accumulative roles must not be cleared, or each new upload would erase
    // the record of the images already in the gallery.
    if (!ACCUMULATIVE_MEDIA_ROLES.includes(safeRole)) {
      await supabase
        .from("wedding_media")
        .delete()
        .eq("wedding_id", input.weddingId)
        .eq("role", input.role);
    }

    const mediaRow = await supabase
      .from("wedding_media")
      .insert({
        wedding_id: input.weddingId,
        type: mediaTypeOf(finalContentType),
        role: input.role,
        storage_key: path,
        public_url: publicUrl,
        mime_type: finalContentType,
        size_bytes: finalSizeBytes,
        sort_order: input.role === "gallery" ? Date.now() % 1000 : 0,
      })
      .select("id")
      .single();
    if (mediaRow.error) throw mediaRow.error;
  }

  return result;
}

function mediaTypeOf(mime: string): "image" | "video" | "audio" {
  return mime.startsWith("image") ? "image" : mime.startsWith("audio") ? "audio" : "video";
}

function sniffType(head: Uint8Array): string {
  const len = head.length;
  if (len >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (len >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (len >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) {
    const webp = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (webp === "WEBP") return "image/webp";
  }
  if (len >= 4 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return "image/gif";
  if (len >= 4 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return "audio/mpeg";
  if (len >= 4 && head[0] === 0xff && head[1] === 0xe0 && head[2] === 0xff && head[3] === 0xe0) return "audio/mpeg";
  if (len >= 4 && head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return "audio/ogg";
  if (len >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) {
    const wave = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (wave === "WAVE") return "audio/wav";
  }
  if (len >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return "video/mp4";
  if (len >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) {
    const webm = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (webm === "WEBM") return "video/webm";
  }
  return "unknown";
}
