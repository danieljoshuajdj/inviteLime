import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isAdmin, jsonError } from "@/lib/services/helpers";
import { guestTokenFromCookies, getGuestDraft } from "@/lib/services/guest";
import { getActiveGuestWedding } from "@/lib/services/guest-wedding";
import {
  isLibraryFolder,
  isWeddingFolder,
  isWeddingMediaRole,
  parseMediaPath,
  guestFolderMatches,
} from "@/lib/services/media-access";
import { verifyMediaToken } from "@/lib/services/media-sign";
import { getObjectStorage, WEDDING_BUCKET } from "@/lib/services/storage";
import { isWeddingExpired } from "@/lib/services/weddings";

export const dynamic = "force-dynamic";

/**
 * Serves wedding media out of the private `weddings` bucket.
 *
 * Guests viewing a published invitation are anonymous, so RLS alone can never
 * admit them, and the bucket cannot simply be made public because a wedding's
 * photos are private to that wedding. This route is the narrow bridge: it
 * re-derives the caller's right to see the object on every request and then
 * streams the bytes with the service role.
 *
 * Paths are `{folder}/{role}/{file}`, where folder is either the wedding UUID
 * (account and published weddings) or a guest-session-scoped name (drafts).
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  const segments = parseMediaPath(path);
  if (!segments) return jsonError(404, "Not found");

  const objectPath = `${segments.folder}/${segments.role}/${segments.file}`;

  const admin = createAdminClient();
  const weddingFolder = isWeddingFolder(segments.folder);
  let publiclyReadable = false;
  /** Cookie-authenticated guest token, used to fall back to migrated media. */
  let draftToken: string | null = null;

  if (isLibraryFolder(segments.folder)) {
    // A library object belongs to the platform, not to a caller, so there is no
    // per-wedding owner to check. Readability is instead tied to the catalogue
    // row: an active track (or an existing pack photo) is world-readable — a
    // guest previews a track before choosing it, and pack photos are demo media
    // every visitor is meant to see. Checking the row rather than the path shape
    // keeps a hidden track from being fetched by direct URL, and a deleted photo
    // from lingering after its row is gone.
    const { data: track } = await admin
      .from("music_tracks")
      .select("id, is_active")
      .eq("storage_key", objectPath)
      .maybeSingle();

    if (track) {
      publiclyReadable = !!track.is_active;
    } else {
      const { data: packItem } = await admin
        .from("media_pack_items")
        .select("id")
        .eq("storage_key", objectPath)
        .maybeSingle();
      publiclyReadable = !!packItem;
    }

    if (!publiclyReadable && !(await callerIsAdmin())) return jsonError(403, "You do not have access to this media");
  } else if (weddingFolder) {
    const { data: wedding } = await admin
      .from("weddings")
      .select("id, user_id, status, expiration_date")
      .eq("id", segments.folder)
      .maybeSingle();

    // A folder shaped like a wedding UUID but with no wedding behind it must not
    // become a public read path, so it is authorized like any other object.
    if (!wedding) {
      if (!(await callerIsAdmin())) return jsonError(404, "Not found");
    } else {
      // Same rule as the `weddings_public_active` RLS policy, so published
      // media is public exactly while the invitation itself is public.
      publiclyReadable =
        wedding.status === "active" && !isWeddingExpired(wedding.expiration_date);

      if (!publiclyReadable && !(await callerOwnsWedding(req, wedding.user_id))) {
        return jsonError(403, "You do not have access to this media");
      }
    }
  } else {
    // A draft is normally authorized by the caller's session cookie. The
    // builder's preview is the exception: it renders in a `srcDoc` frame
    // sandboxed without `allow-same-origin`, so that frame has an opaque origin
    // and can never send the cookie, and the object would be unreachable even
    // though the payload handed the template a URL for it. A short-lived
    // signature over the exact object key stands in for the cookie there, and
    // is scoped tightly enough that it cannot authorize any other object.
    //
    // The library photo role never parses outside the library folder, so this
    // guard is unreachable in practice; it narrows the type for the role-salt
    // lookup in guestFolderMatches.
    if (!isWeddingMediaRole(segments.role)) return jsonError(404, "Not found");
    const token = guestTokenFromCookies(req.headers.get("cookie"));
    const sig = new URL(req.url).searchParams.get("sig");
    const signed = sig !== null && verifyMediaToken(sig, objectPath);

    let ownsDraft = signed || guestFolderMatches(segments.folder, segments.role, token);
    if (!ownsDraft && token) {
      // A live session is required; the folder shape alone is not enough.
      const draft = await getGuestDraft(admin, token).catch(() => null);
      ownsDraft = !!draft && guestFolderMatches(segments.folder, segments.role, token);
    }
    if (!ownsDraft) return jsonError(403, "You do not have access to this media");
    if (token) draftToken = token;
  }

  const storage = await getObjectStorage();
  let object = await storage.download(WEDDING_BUCKET, objectPath);

  // Publishing moves a draft's uploads into the wedding folder. A builder tab
  // that was open across that move still requests the old draft-scoped URL;
  // resolve it to the same object in the session's published wedding folder so
  // the portraits and gallery do not turn into alt text. Only the session that
  // owns the draft (verified above) may use this bridge, and only after the
  // original object is gone.
  if (!object && draftToken) {
    const draft = await getGuestDraft(admin, draftToken).catch(() => null);
    const live = draft
      ? await getActiveGuestWedding(admin, draft.session_id).catch(() => null)
      : null;
    if (live) {
      object = await storage.download(
        WEDDING_BUCKET,
        `${live.id}/${segments.role}/${segments.file}`
      );
    }
  }

  if (!object) return jsonError(404, "Not found");

  const body = object.body.buffer.slice(
    object.body.byteOffset,
    object.body.byteOffset + object.body.byteLength
  ) as ArrayBuffer;
  const contentType = object.contentType || "application/octet-stream";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // A published invitation is world-readable, so its media may be cached
      // publicly. Anything owner-only stays in the browser.
      "Cache-Control": publiclyReadable
        ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
        : "private, no-store",
    },
  });
}

/** Owner or platform admin may read media for a wedding that is not published. */
async function callerOwnsWedding(req: Request, userId: string | null): Promise<boolean> {
  try {
    const server = await createServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (user && userId && user.id === userId) return true;
    return await isAdmin(server);
  } catch {
    return false;
  }
}

async function callerIsAdmin(): Promise<boolean> {
  try {
    return await isAdmin(await createServerClient());
  } catch {
    return false;
  }
}
