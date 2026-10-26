import { createHash } from "node:crypto";

import {
  LIBRARY_FOLDER,
  LIBRARY_MEDIA_ROLE,
  MAX_MUSIC_BYTES as LIBRARY_MAX_MUSIC_BYTES,
} from "@/lib/library-media";

import { ROLE_SALT, type MediaRole } from "./storage";

/**
 * Access rules for wedding media served out of the private `weddings` bucket.
 *
 * Kept free of server-only imports so the rules that decide who may read an
 * object can be unit tested directly.
 */

export const MEDIA_FOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
export const MEDIA_FILE_RE = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,8}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MEDIA_ROLES: readonly string[] = ["bride", "groom", "couple", "gallery", "music", "video"];

/**
 * A role segment as it arrives in a media URL.
 *
 * `media` is the media-pack photo directory and only ever exists inside the
 * reserved library folder; every other role is a wedding upload role.
 */
export type MediaAccessRole = MediaRole | typeof LIBRARY_MEDIA_ROLE;

export interface MediaSegments {
  folder: string;
  role: MediaAccessRole;
  file: string;
}

/** True for the wedding upload roles (everything but the library photo role). */
export function isWeddingMediaRole(role: MediaAccessRole): role is MediaRole {
  return (MEDIA_ROLES as readonly string[]).includes(role);
}

/**
 * Accepts only `folder/role/file` with conservative characters. The storage key
 * is assembled by hand from these values, so a traversal or separator segment
 * would otherwise be handed straight to the storage API.
 *
 * The library's `media` role is accepted only under the library folder, so a
 * wedding or draft folder can never claim it.
 */
export function parseMediaPath(segments: string[] | undefined): MediaSegments | null {
  if (!segments || segments.length !== 3) return null;
  const [folder, role, file] = segments;
  if (!MEDIA_FOLDER_RE.test(folder)) return null;
  const roleAllowed =
    (MEDIA_ROLES as readonly string[]).includes(role) ||
    (folder === LIBRARY_FOLDER && role === LIBRARY_MEDIA_ROLE);
  if (!roleAllowed) return null;
  if (!MEDIA_FILE_RE.test(file)) return null;
  return { folder, role: role as MediaAccessRole, file };
}

/**
 * Digest prefix shared by every folder a guest session may own, regardless of
 * role or salt. Lets a caller enumerate all of one session's draft media with a
 * single storage prefix, which is how invitation deletion finds uploads that
 * were never migrated to a wedding folder.
 */
export function guestFolderDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * Derives the draft media folder for a guest session.
 *
 * The folder must not be a prefix of the session token: a truncated secret
 * becomes a partial credential, since anyone holding it could read that draft's
 * media. A digest of the whole token is used instead, so the folder is stable
 * for the life of the session but reveals nothing usable on its own.
 */
export function mediaFolderForGuest(token: string, role: MediaRole, salt: number): string {
  return `${guestFolderDigest(token)}-${ROLE_SALT[role]}-${salt}`;
}

/** True when the folder is exactly the one derived from this token and role. */
export function guestFolderMatches(folder: string, role: MediaRole, token: string | null): boolean {
  if (!token) return false;
  const [digest, saltRaw, salt] = folder.split("-");
  if (!digest || !saltRaw || salt === undefined) return false;
  if (saltRaw !== String(ROLE_SALT[role])) return false;
  if (!/^\d{1,10}$/.test(salt)) return false;
  return digest === guestFolderDigest(token);
}

/** Wedding-UUID folders are authorized as a wedding; anything else as a draft. */
export function isWeddingFolder(folder: string): boolean {
  return UUID_RE.test(folder);
}

/**
 * The library folder.
 *
 * Library objects belong to no single wedding, so neither existing folder kind
 * can describe them: they are not a wedding UUID, and they are not derived from
 * any guest token, so `guestFolderMatches` would refuse them and a guest could
 * never preview a track before attaching it. A reserved literal prefix is used
 * instead, reusing the existing `folder/role/file` shape so no new parsing rules
 * are needed.
 *
 * Re-exported from `@/lib/library-media` so client components can reference it
 * without importing this module's `node:crypto` dependency.
 */
export {
  LIBRARY_FOLDER,
  LIBRARY_MEDIA_ROLE,
  LIBRARY_MAX_MUSIC_BYTES as MAX_MUSIC_BYTES,
};

/** True for the reserved library folder only. */
export function isLibraryFolder(folder: string): boolean {
  return folder === LIBRARY_FOLDER;
}

/**
 * Storage key for a library audio object.
 *
 * The basename is a caller-supplied unique id rather than the uploaded file
 * name: titles are user text, and a file name would both need escaping and
 * could collide between two uploads of the same track name. The extension is
 * derived from the sniffed MIME type, not the uploaded name.
 */
export function libraryMusicKey(uniqueId: string, ext: string): string {
  const safeId = uniqueId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "mp3";
  return `${LIBRARY_FOLDER}/music/${safeId}.${safeExt}`;
}

/**
 * Storage key for a library media-pack photo.
 *
 * Sits beside music under the reserved library folder. The `media` role
 * directory is what the path parser uses to tell a pack photo from a track,
 * and the basename is a random id so a re-upload can never collide.
 */
export function libraryMediaKey(uniqueId: string, ext: string): string {
  const safeId = uniqueId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "webp";
  return `${LIBRARY_FOLDER}/${LIBRARY_MEDIA_ROLE}/${safeId}.${safeExt}`;
}
