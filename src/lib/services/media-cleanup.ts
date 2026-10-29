import type { AdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  guestFolderMatches,
  isLibraryFolder,
  isWeddingFolder,
  isWeddingMediaRole,
  parseMediaPath,
  UUID_RE,
} from "./media-access";
import { mediaObjectKey } from "./media-urls";
import { mediaKeysInWeddingData } from "./invitation-deletion";
import { WEDDING_BUCKET, getObjectStorage, type ObjectStorage } from "./storage";

/**
 * Deletes media objects that no invitation, draft or `wedding_media` row points
 * at any more.
 *
 * Uploading happens the moment a file is picked, while the builder only saves
 * its draft on the next autosave. A replacement therefore supersedes the old
 * object before the database knows about the new one. Deleting eagerly would
 * break the currently saved draft/live invitation; deleting only on save would
 * leave the upload-then-change-your-mind case behind forever. Every deletion
 * here is therefore gated on a fresh reference check:
 *
 *  * any `wedding_media` row that still records the key, unless the caller
 *    explicitly named that key as superseded and the row belongs to the
 *    wedding being cleaned,
 *  * every media URL in a wedding's `wedding_data`,
 *  * every media URL in a live guest draft for the owning session.
 *
 * Shared `library/` objects are never candidates: they belong to the platform,
 * not to one invitation. A reference lookup that fails keeps every key instead
 * of risking a live image, and an object-delete failure is reported so a later
 * save/cleanup can retry it.
 */

/** Upper bound per call; candidates are URLs from a single wedding/draft. */
export const MAX_MEDIA_CLEANUP_KEYS = 200;

/**
 * How long an unclaimed `wedding_media` row is left alone before a sweep may
 * treat it as abandoned.
 *
 * The row is written by the upload endpoint the moment a file lands, while the
 * editor only persists the new URL on its next autosave. A save that was
 * already in flight during the upload carries the previous image, so sweeping
 * the new row right away would delete an object the editor is about to save.
 * Explicitly named keys (a replacement or a removal) skip this grace: the
 * caller has already stated the object is no longer wanted.
 */
export const STALE_WEDDING_MEDIA_GRACE_MS = 24 * 60 * 60 * 1000;

/** Roles whose object is mirrored into `wedding_data` and can be reconciled. */
const DATA_BACKED_ROLES: readonly string[] = [
  "bride",
  "groom",
  "couple",
  "gallery",
  "music",
];

export interface MediaCleanupScope {
  /** Live wedding whose data and media rows may reference an object. */
  weddingId?: string | null;
  /** Guest session whose draft may still reference an object. */
  guestSessionId?: string | null;
  /** Exact draft row to inspect even when the session is not known yet. */
  draftId?: string | null;
}

export interface MediaCleanupOptions {
  /**
   * Also consider every `wedding_media` row for `weddingId` as a candidate.
   *
   * A save replaces the complete `wedding_data` blob, so a recorded row that
   * the new blob does not mention is a leftover — including an upload the user
   * abandoned before clicking Save. Only rows past `STALE_WEDDING_MEDIA_GRACE_MS`
   * are swept, so an upload whose autosave is still in flight is not deleted
   * out from under the editor. Only data-backed roles are considered, so a
   * future video field is not swept away by a model that does not know it yet.
   */
  includeStaleWeddingMedia?: boolean;
}

export interface MediaCleanupDeps {
  admin?: AdminClient;
  storage?: ObjectStorage;
}

/** Everything a cleanup call may specify, without positional argument noise. */
export interface MediaCleanupRequest
  extends MediaCleanupScope,
    MediaCleanupOptions,
    MediaCleanupDeps {}

export interface MediaCleanupResult {
  deleted: string[];
  kept: string[];
  failures: Array<{ key: string; detail: string }>;
}

/**
 * Normalises URLs and storage keys into de-duplicated object keys.
 *
 * External URLs, malformed paths and shared library objects are ignored. The
 * result is deliberately bounded: callers only ever pass the handful of media
 * slots a draft can hold.
 */
export function normalizeMediaCleanupKeys(values: Iterable<unknown>): string[] {
  const keys = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const raw = value.trim();
    if (!raw) continue;

    let key = mediaObjectKey(raw);
    if (!key) {
      // The save/upload paths already hold a plain `folder/role/file` key.
      const plain = raw.split("?")[0];
      const parsed = parseMediaPath(plain.split("/"));
      if (parsed) key = `${parsed.folder}/${parsed.role}/${parsed.file}`;
    }
    if (!key) continue;

    const parsed = parseMediaPath(key.split("/"));
    if (!parsed) continue;
    if (isLibraryFolder(parsed.folder)) continue;

    keys.add(key);
    if (keys.size >= MAX_MEDIA_CLEANUP_KEYS) break;
  }

  return [...keys];
}

/**
 * Whether a caller has authority over an object key.
 *
 * Wedding objects belong to the wedding their folder names; draft objects
 * belong to the guest session whose token derives the folder. Anything else —
 * another wedding, another session, the shared library — is refused before a
 * reference check even runs.
 */
export function isMediaCleanupAllowed(
  key: string,
  scope: { weddingId?: string | null; guestToken?: string | null }
): boolean {
  const parsed = parseMediaPath(key.split("/"));
  if (!parsed) return false;
  if (isLibraryFolder(parsed.folder)) return false;

  if (isWeddingFolder(parsed.folder)) {
    return Boolean(scope.weddingId) && parsed.folder === scope.weddingId;
  }

  if (!isWeddingMediaRole(parsed.role)) return false;
  return guestFolderMatches(parsed.folder, parsed.role, scope.guestToken ?? null);
}

function failureFor(keys: string[], detail: string): MediaCleanupResult {
  return {
    deleted: [],
    kept: keys,
    failures: keys.map((key) => ({ key, detail })),
  };
}

/** True when a row's timestamp is present, parseable and past the grace window. */
function isPastGrace(value: unknown, cutoff: number): boolean {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= cutoff;
}

/**
 * Removes every candidate object that is no longer referenced.
 *
 * Query failures are fail-safe: nothing is deleted when the database cannot
 * answer whether a key is still in use. Storage failures are reported per key
 * and leave the reference row in place where possible, so a later save or the
 * same cleanup call can retry.
 */
export async function deleteUnreferencedMediaKeys(
  values: Iterable<unknown>,
  request: MediaCleanupRequest = {}
): Promise<MediaCleanupResult> {
  const { admin: injectedAdmin, storage: injectedStorage, ...scope } = request;
  const { includeStaleWeddingMedia = false } = request;
  const admin = injectedAdmin ?? createAdminClient();
  const keys = new Set(normalizeMediaCleanupKeys(values));
  // Keys the caller named itself. These may be removed even while their row is
  // still inside the grace window; swept rows may not.
  const explicitKeys = new Set(keys);
  const staleCutoff = Date.now() - STALE_WEDDING_MEDIA_GRACE_MS;

  // Load stale recorded rows first: their keys become candidates too. A failure
  // here means the reference picture is incomplete, so nothing may be removed.
  if (includeStaleWeddingMedia && scope.weddingId) {
    const { data, error } = await admin
      .from("wedding_media")
      .select("storage_key, role, created_at")
      .eq("wedding_id", scope.weddingId);

    if (error) {
      return failureFor([...keys], `Could not read wedding media: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (!DATA_BACKED_ROLES.includes(row.role)) continue;
      // A just-uploaded row may still be waiting for its editor's next save.
      if (!isPastGrace(row.created_at, staleCutoff)) continue;
      if (keys.size >= MAX_MEDIA_CLEANUP_KEYS) break;
      const normalised = normalizeMediaCleanupKeys([row.storage_key]);
      for (const key of normalised) keys.add(key);
    }
  }

  const candidates = [...keys].slice(0, MAX_MEDIA_CLEANUP_KEYS);
  if (candidates.length === 0) return { deleted: [], kept: [], failures: [] };

  const weddingIds = new Set<string>();
  if (scope.weddingId && UUID_RE.test(scope.weddingId)) weddingIds.add(scope.weddingId);
  for (const key of candidates) {
    const folder = key.split("/")[0];
    if (isWeddingFolder(folder)) weddingIds.add(folder);
  }

  const sessionIds = new Set<string>();
  if (scope.guestSessionId) sessionIds.add(scope.guestSessionId);

  const referenced = new Set<string>();

  // 1. Weddings own the authoritative media blob.
  if (weddingIds.size > 0) {
    const { data, error } = await admin
      .from("weddings")
      .select("id, guest_session_id, wedding_data")
      .in("id", [...weddingIds]);

    if (error) {
      return failureFor(candidates, `Could not read invitations: ${error.message}`);
    }

    for (const row of data ?? []) {
      for (const key of mediaKeysInWeddingData(row.wedding_data)) referenced.add(key);
      if (row.guest_session_id) sessionIds.add(row.guest_session_id);
    }
  }

  // 2. The exact draft being saved is always inspected, even if its session is
  //    not otherwise known to this call. Doing this before the session sweep
  //    means a session learned only from the draft still gets all its drafts
  //    checked (a session can own more than one draft row).
  if (scope.draftId) {
    const { data, error } = await admin
      .from("guest_drafts")
      .select("session_id, wedding_data")
      .eq("id", scope.draftId)
      .maybeSingle();

    if (error) {
      return failureFor(candidates, `Could not read the guest draft: ${error.message}`);
    }

    if (data) {
      for (const key of mediaKeysInWeddingData(data.wedding_data)) referenced.add(key);
      if (data.session_id) sessionIds.add(data.session_id);
    }
  }

  // 3. A published invitation's builder draft can still point at the same
  //    objects (the two are mirrored after checkout). An expired draft cannot.
  if (sessionIds.size > 0) {
    const { data, error } = await admin
      .from("guest_drafts")
      .select("id, session_id, wedding_data")
      .in("session_id", [...sessionIds])
      .gt("expires_at", new Date().toISOString());

    if (error) {
      return failureFor(candidates, `Could not read guest drafts: ${error.message}`);
    }

    for (const row of data ?? []) {
      for (const key of mediaKeysInWeddingData(row.wedding_data)) referenced.add(key);
    }
  }

  // 4. Rows recorded against a wedding are references too. A row for the
  //    wedding being cleaned that the current blob no longer mentions is stale;
  //    remove the object first so a storage failure leaves the row for a retry.
  const { data: mediaRows, error: mediaError } = await admin
    .from("wedding_media")
    .select("id, wedding_id, storage_key, created_at")
    .in("storage_key", candidates);

  if (mediaError) {
    return failureFor(candidates, `Could not read wedding media: ${mediaError.message}`);
  }

  const staleRowIds = new Map<string, string[]>();
  for (const row of mediaRows ?? []) {
    if (referenced.has(row.storage_key)) continue;

    // A row that belongs to a wedding in scope but is no longer in that
    // wedding's blob is a leftover from a replacement/save. Its key is already
    // a candidate; remember the row so it can follow the object out.
    //
    // An explicit key may go immediately (the caller already decided). A swept
    // row must be past its grace window, so an upload whose autosave is still
    // in flight is not deleted out from under the editor. Any other row is a
    // live reference and keeps the object.
    const removable =
      weddingIds.has(row.wedding_id) &&
      (explicitKeys.has(row.storage_key) || isPastGrace(row.created_at, staleCutoff));

    if (removable) {
      const list = staleRowIds.get(row.storage_key) ?? [];
      list.push(row.id);
      staleRowIds.set(row.storage_key, list);
    } else {
      referenced.add(row.storage_key);
    }
  }

  const storage = injectedStorage ?? (await getObjectStorage());
  const deleted: string[] = [];
  const kept: string[] = [];
  const failures: Array<{ key: string; detail: string }> = [];

  for (const key of candidates) {
    if (referenced.has(key)) {
      kept.push(key);
      continue;
    }

    const parsed = parseMediaPath(key.split("/"));
    // Without a session a draft-folder object cannot be checked against the
    // only draft that could reference it. Keep it rather than guess.
    if (parsed && !isWeddingFolder(parsed.folder) && sessionIds.size === 0) {
      kept.push(key);
      continue;
    }

    try {
      await storage.delete(WEDDING_BUCKET, key);
    } catch (err) {
      failures.push({
        key,
        detail: err instanceof Error ? err.message : "storage error",
      });
      continue;
    }

    deleted.push(key);

    const rowIds = staleRowIds.get(key);
    if (rowIds && rowIds.length > 0) {
      const { error: rowError } = await admin.from("wedding_media").delete().in("id", rowIds);
      if (rowError) {
        failures.push({
          key,
          detail: `Object removed but media row cleanup failed: ${rowError.message}`,
        });
      }
    }
  }

  return { deleted, kept, failures };
}
