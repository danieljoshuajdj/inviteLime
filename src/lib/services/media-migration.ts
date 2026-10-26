import { createAdminClient } from "@/lib/supabase/admin";
import { isLibraryFolder, isWeddingFolder, isWeddingMediaRole, parseMediaPath } from "./media-access";
import { mediaObjectKey } from "./media-urls";
import {
  WEDDING_BUCKET,
  getObjectStorage,
  isAlreadyExistsError,
  mediaUrlForPath,
  type MediaRole,
} from "./storage";

/**
 * Moves a published wedding's media out of the guest-draft folder and into the
 * wedding's own folder.
 *
 * The builder uploads before any wedding row exists, so every photo, gallery
 * image and soundtrack lands in a folder derived from the guest session token.
 * `/api/media` authorizes such a folder against the caller's `vc_guest_token`
 * and nothing else, which is right while the draft is private but means the
 * object is unreadable to the very guests the invitation is sent to. Publishing
 * therefore has to relocate the objects into `{weddingId}/{role}/{file}` — the
 * folder `/api/media` authorizes as a published wedding — and repoint the URLs
 * held in `wedding_data`.
 *
 * The relocation is deliberately best-effort: a paid couple must get their
 * invitation even if storage misbehaves, so a failure leaves the original
 * draft-scoped URL in place (owner-visible, invitee-private) instead of blocking
 * publication.
 */

export interface MediaMove {
  /** Role directory the object lives in, read from the object key. */
  role: MediaRole;
  fromPath: string;
  toPath: string;
  toUrl: string;
  /** Position within the gallery, so migrated rows keep the couple's ordering. */
  order?: number;
  /**
   * Copy the object and leave the original in place.
   *
   * Set for library tracks. A library object is shared by every invitation that
   * picked it, so relocating it would break all the others; each wedding gets
   * its own copy and the catalogue keeps serving the track.
   */
  copyOnly?: boolean;
}

export interface MediaMigrationPlan {
  moves: MediaMove[];
  data: Record<string, unknown>;
}

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  aac: "audio/aac",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Single-object slots in `wedding_data`, each stored as a bare URL string. */
const URL_SLOTS: ReadonlyArray<{ key: string; role: MediaRole }> = [
  { key: "bridePhoto", role: "bride" },
  { key: "groomPhoto", role: "groom" },
  { key: "couplePhoto", role: "couple" },
];

/**
 * Recovers the storage key behind an app media URL. Accepts absolute URLs too,
 * since a template payload may carry a fully qualified link.
 */
export const mediaPathFromUrl = mediaObjectKey;

function mimeOfPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? null;
}

function typeOfRole(role: MediaRole): "image" | "video" | "audio" {
  if (role === "music") return "audio";
  if (role === "video") return "video";
  return "image";
}

/**
 * Works out which media objects must move and returns the `wedding_data` with
 * those URLs repointed at the wedding folder.
 *
 * Pure, so the rewrite rules can be tested without storage. `allow` exists
 * because the caller only learns which moves actually succeeded after talking to
 * storage: re-running the plan with the successful set yields a blob that
 * rewrites exactly the objects that landed and leaves the rest alone.
 */
export function planMediaMigration(
  weddingId: string,
  rawData: unknown,
  allow?: (move: MediaMove) => boolean
): MediaMigrationPlan {
  const data: Record<string, unknown> = { ...((rawData ?? {}) as Record<string, unknown>) };
  const moves: MediaMove[] = [];
  const seenFrom = new Set<string>();
  const claimedTo = new Set<string>();

  const take = (url: unknown, order?: number): string | undefined => {
    const fromPath = mediaPathFromUrl(url);
    if (!fromPath) return undefined;
    const parsed = parseMediaPath(fromPath.split("/"));
    if (!parsed) return undefined;
    // Already wedding-scoped: either migrated by an earlier run or uploaded
    // through the account editor, which writes straight to the wedding folder.
    if (isWeddingFolder(parsed.folder)) return undefined;
    // Library pack photos carry the reserved "media" role, which only exists
    // inside the library folder. Copying one into a wedding folder would mint a
    // key the media route refuses to serve, so such URLs are left untouched.
    if (!isWeddingMediaRole(parsed.role)) return undefined;

    const toPath = `${weddingId}/${parsed.role}/${parsed.file}`;
    // One object must not be moved twice, and two objects must never be
    // collapsed onto one destination key.
    if (seenFrom.has(fromPath) || claimedTo.has(toPath)) return undefined;

    const move: MediaMove = {
      role: parsed.role,
      fromPath,
      toPath,
      toUrl: mediaUrlForPath(toPath),
      order,
      // A library track is shared, so it is copied rather than relocated.
      copyOnly: isLibraryFolder(parsed.folder),
    };
    if (allow && !allow(move)) return undefined;

    seenFrom.add(fromPath);
    claimedTo.add(toPath);
    moves.push(move);
    return toPath;
  };

  for (const { key } of URL_SLOTS) {
    const toPath = take(data[key]);
    if (toPath) data[key] = mediaUrlForPath(toPath);
  }

  if (Array.isArray(data.gallery)) {
    data.gallery = data.gallery.map((item, index) => {
      if (!item || typeof item !== "object") return item;
      const entry = { ...(item as Record<string, unknown>) };
      const toPath = take(entry.url, index);
      if (toPath) entry.url = mediaUrlForPath(toPath);
      return entry;
    });
  }

  if (data.music && typeof data.music === "object") {
    const entry = { ...(data.music as Record<string, unknown>) };
    const toPath = take(entry.url);
    if (toPath) entry.url = mediaUrlForPath(toPath);
    data.music = entry;
  }

  return { moves, data };
}

export interface MediaMigrationResult {
  moved: number;
  failed: number;
  recorded: number;
  /**
   * The wedding data after every successful rewrite. Callers use this to keep a
   * guest draft pointing at the same objects, so an open builder tab does not
   * reload URLs whose files were just moved.
   */
  data: Record<string, unknown>;
}

/**
 * Relocates every draft-scoped object referenced by a wedding's `wedding_data`,
 * repoints the blob, and records the landed objects in `wedding_media`.
 *
 * Safe to run more than once: objects already in the wedding folder are skipped,
 * and a destination left behind by an interrupted earlier run is adopted rather
 * than treated as a failure.
 */
export async function migrateDraftMediaToWedding(
  weddingId: string,
  rawData: unknown
): Promise<MediaMigrationResult> {
  const plan = planMediaMigration(weddingId, rawData);
  const { moves } = plan;
  if (moves.length === 0) {
    return { moved: 0, failed: 0, recorded: 0, data: plan.data };
  }

  const supabase = createAdminClient();
  const storage = await getObjectStorage();
  const landed: MediaMove[] = [];
  let failed = 0;

  for (const move of moves) {
    try {
      if (move.copyOnly) {
        await storage.copy(WEDDING_BUCKET, move.fromPath, move.toPath);
        landed.push(move);
        continue;
      }
      await storage.move(WEDDING_BUCKET, move.fromPath, move.toPath);
      landed.push(move);
      continue;
    } catch (error) {
      // An earlier attempt may have moved the object and then failed before the
      // blob was rewritten. `move` rejects when the destination is occupied, so
      // the collision is expected: throw away the leftover source.
      if (isAlreadyExistsError(error)) {
        // The destination is occupied. For a copy that means a previous attempt
        // already placed this wedding's copy, so the work is done and the
        // shared library source must be left alone. For a move, the leftover
        // source is a duplicate and is safe to discard.
        if (!move.copyOnly) {
          await storage.delete(WEDDING_BUCKET, move.fromPath).catch(() => {});
        }
        landed.push(move);
        continue;
      }
      failed += 1;
      console.warn("[media-migration] move failed", {
        from: move.fromPath,
        to: move.toPath,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  let migratedData =
    rawData && typeof rawData === "object" && !Array.isArray(rawData)
      ? { ...(rawData as Record<string, unknown>) }
      : {};
  if (landed.length > 0) {
    const { data } = planMediaMigration(weddingId, rawData, (move) =>
      landed.some((done) => done.toPath === move.toPath)
    );
    migratedData = data;
    const { error: updateError } = await supabase
      .from("weddings")
      .update({ wedding_data: data as never })
      .eq("id", weddingId);
    if (updateError) {
      throw new Error(`MEDIA_BLOB_UPDATE_FAILED: ${updateError.message}`);
    }
  }

  const recorded = await recordWeddingMedia(supabase, weddingId, landed);
  return { moved: landed.length, failed, recorded, data: migratedData };
}

/**
 * Inserts `wedding_media` rows for relocated objects. The table has no unique
 * constraint, so existing keys are filtered out to keep a re-run from
 * duplicating rows.
 */
async function recordWeddingMedia(
  supabase: ReturnType<typeof createAdminClient>,
  weddingId: string,
  landed: MediaMove[]
): Promise<number> {
  if (landed.length === 0) return 0;

  const { data: existing } = await supabase
    .from("wedding_media")
    .select("storage_key")
    .eq("wedding_id", weddingId);
  const known = new Set((existing ?? []).map((row) => row.storage_key as string));

  const rows = landed
    .filter((move) => !known.has(move.toPath))
    .map((move) => ({
      wedding_id: weddingId,
      type: typeOfRole(move.role),
      role: move.role,
      storage_key: move.toPath,
      public_url: move.toUrl,
      mime_type: mimeOfPath(move.toPath),
      // Size is not fetched: this runs inside the payment webhook, and a
      // `list()` round trip per object is not worth a nullable column that
      // nothing currently reads.
      size_bytes: null,
      sort_order: move.order ?? 0,
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("wedding_media").insert(rows);
  if (error) {
    console.warn("[media-migration] could not record rows", error.message);
    return 0;
  }
  return rows.length;
}
