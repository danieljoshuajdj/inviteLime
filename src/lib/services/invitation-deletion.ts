/**
 * Works out which stored objects belong to a wedding, so an admin delete can
 * remove them without guessing.
 *
 * Kept free of server-only imports (no storage client, no Supabase) so the
 * rules can be unit tested directly.
 */

import { guestFolderDigest, LIBRARY_FOLDER } from "./media-access";
import { mediaObjectKey } from "./media-urls";

export interface DeletionPlanInput {
  /** The wedding uuid. Published media is keyed by this. */
  weddingId: string;
  /**
   * Access tokens of guest sessions that own uploads for this wedding. Draft
   * media lives in a token-derived folder rather than the wedding's own, so it
   * has to be found by digest prefix.
   */
  guestAccessTokens?: (string | null)[] | null;
  /** Object keys recorded against this wedding in `wedding_media`. */
  recordedKeys?: string[] | null;
}

export interface DeletionPlan {
  /** Storage prefixes to enumerate with `storage.list`. */
  prefixes: string[];
  /** Explicit object keys to delete in addition to anything listed above. */
  explicitKeys: string[];
  /** True when the wedding's own uuid folder should be enumerated. */
  hasWeddingFolder: boolean;
}

/** Matches `folder/role/file`, the only shape the media route accepts. */
const OBJECT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}\/(bride|groom|couple|gallery|music|video)\/[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,8}$/;

/**
 * Builds the set of objects to purge for a wedding.
 *
 * Two distinct sources of objects exist:
 *  - Published media, keyed `{weddingId}/{role}/{file}`.
 *  - Draft uploads from the guest session, keyed `{tokenDigest}-{role}-{salt}/…`.
 *    These survive when a wedding was never published, or when publishing
 *    happened without media migration completing, and would otherwise be
 *    orphaned in the bucket forever.
 *
 * Keys recorded in `wedding_media` are also honoured directly, so a row whose
 * object was moved or renamed is still cleaned up rather than skipped.
 */
export function planWeddingObjectDeletion(input: DeletionPlanInput): DeletionPlan {
  const prefixes: string[] = [];
  const explicitKeys: string[] = [];
  const seen = new Set<string>();

  const weddingPrefix = `${input.weddingId}/`;
  // The uuid folder is always enumerated: publishing migrates media into it,
  // and it is the only prefix /api/media authorizes a live link against.
  prefixes.push(weddingPrefix);
  seen.add(weddingPrefix);

  for (const token of input.guestAccessTokens ?? []) {
    if (!token) continue;
    // One prefix per session covers every role and salt that session uploaded
    // under, since the digest is the leading segment of every folder.
    const prefix = `${guestFolderDigest(token)}-`;
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    prefixes.push(prefix);
  }

  for (const key of input.recordedKeys ?? []) {
    if (!key || !OBJECT_KEY_RE.test(key)) continue;
    // A library track is shared by every invitation that picked it, so it must
    // survive this wedding's deletion. Its shape is otherwise indistinguishable
    // from ordinary media (`library/music/track-x.mp3` matches OBJECT_KEY_RE),
    // so the exclusion is made explicitly here rather than left to the absence
    // of such a key ever being recorded.
    if (key.startsWith(`${LIBRARY_FOLDER}/`)) continue;
    // Already covered by an enumerated prefix.
    if (prefixes.some((p) => key.startsWith(p))) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    explicitKeys.push(key);
  }

  return { prefixes, explicitKeys, hasWeddingFolder: true };
}

/**
 * Object keys a wedding's `wedding_data` blob points at.
 *
 * The blob is the only authoritative record of what the couple uploaded: media
 * migration repoints these URLs as it moves objects between folders, and the
 * owning guest session can already be gone by purge time (guest sessions expire
 * after 14 days). Relying on the session token alone would therefore leave any
 * un-migrated file behind forever. The slots mirror `planMediaMigration`, which
 * is the code that wrote these URLs in the first place.
 */
export function mediaKeysInWeddingData(rawData: unknown): string[] {
  const data = (rawData ?? {}) as Record<string, unknown>;
  const keys: string[] = [];
  const take = (url: unknown) => {
    const key = mediaObjectKey(url);
    if (key) keys.push(key);
  };

  take(data.bridePhoto);
  take(data.groomPhoto);
  take(data.couplePhoto);
  take(data.mainPhoto);
  if (Array.isArray(data.gallery)) {
    for (const item of data.gallery) {
      if (item && typeof item === "object") take((item as Record<string, unknown>).url);
    }
  }
  if (data.music && typeof data.music === "object") {
    take((data.music as Record<string, unknown>).url);
  }

  return keys;
}