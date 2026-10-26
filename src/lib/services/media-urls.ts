import type { RuntimeWeddingInput } from "@/lib/runtime/payload";
import { guestFolderMatches, isWeddingFolder, isWeddingMediaRole, parseMediaPath } from "./media-access";

/**
 * Media URL rewriting for the invitation runtime.
 *
 * `wedding_data` stores media as an app-relative path (`/api/media/...`). That
 * is the right thing to persist, but it does not survive the trip into a
 * template package, for two independent reasons:
 *
 * * The runtime injects `<base href>` pointing at the template's own immutable
 *   object-storage prefix so relative template assets resolve. Any relative
 *   media path is then resolved against the storage host, not the app, and 404s.
 * * The frame itself is `srcDoc` + `sandbox` without `allow-same-origin`. It has
 *   an opaque origin, so the guest's `vc_guest_token` cookie is never attached
 *   and a draft-scoped object would be refused even if the path resolved.
 *
 * So the payload carries absolute URLs, and for un-published drafts a signature
 * as well. Kept free of server-only imports so the rules can be unit tested
 * directly; the signer is injected rather than imported.
 */

const MEDIA_URL_MARKER = "/api/media/";

/** Storage key behind a media URL, or null when the URL is not one of ours. */
export function mediaObjectKey(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const at = url.indexOf(MEDIA_URL_MARKER);
  if (at === -1) return null;
  const rest = url.slice(at + MEDIA_URL_MARKER.length);
  if (!rest) return null;
  const segments = rest.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  // Re-validated rather than trusted: the key is handed to the storage API and,
  // once signing is in play, commits to a signature.
  const parsed = parseMediaPath(segments);
  return parsed ? `${parsed.folder}/${parsed.role}/${parsed.file}` : null;
}

/** App-relative URL for a media object key. */
function mediaPathForKey(key: string): string {
  return `${MEDIA_URL_MARKER}${key.split("/").map(encodeURIComponent).join("/")}`;
}

function appOrigin(appUrl: string): string {
  return appUrl.replace(/\/+$/, "");
}

/**
 * Absolute, unsigned media URL. Sufficient for a published invitation: its
 * objects live in the wedding folder, which `/api/media` treats as public for
 * exactly as long as the invitation itself is public.
 */
export function absolutizeMediaUrl(url: unknown, appUrl: string): string | null {
  const key = mediaObjectKey(url);
  if (!key) return null;
  return `${appOrigin(appUrl)}${mediaPathForKey(key)}`;
}

/**
 * Absolute, signed media URL for an un-published draft.
 *
 * Signing is deliberately narrow. Only a folder derived from the caller's own
 * guest token is signed, so a couple cannot talk the platform into minting a
 * capability for somebody else's object. Wedding folders are left unsigned —
 * the wedding's own publication state is what authorizes those, and a
 * signature must not become a second, weaker way in.
 */
export function signDraftMediaUrl(
  url: unknown,
  options: {
    appUrl: string;
    guestToken: string | null;
    sign: (subject: string) => string;
  }
): string | null {
  const key = mediaObjectKey(url);
  if (!key) return null;

  const parsed = parseMediaPath(key.split("/"));
  if (!parsed) return null;

  if (isWeddingFolder(parsed.folder) || !options.guestToken) {
    return absolutizeMediaUrl(url, options.appUrl);
  }
  // A library object is never signed — its catalogue row authorizes reads, and
  // its role ("music", or the reserved "media") is not a guest-upload role.
  // Returning null leaves the URL exactly as it came in.
  if (!isWeddingMediaRole(parsed.role)) return null;
  if (!guestFolderMatches(parsed.folder, parsed.role, options.guestToken)) return null;

  const sig = options.sign(key);
  return `${appOrigin(options.appUrl)}${mediaPathForKey(key)}?sig=${encodeURIComponent(sig)}`;
}

/**
 * Applies a URL rewrite across every media slot a template can read: the three
 * portraits, the gallery, and the soundtrack. Returns a new input; the caller's
 * object is not mutated.
 *
 * A rewrite that returns null means "leave this value alone", so external URLs
 * the couple supplied, absent slots and untouched fields all survive intact.
 */
export function rewriteRuntimeMedia(
  wedding: RuntimeWeddingInput,
  rewrite: (url: string) => string | null
): RuntimeWeddingInput {
  const one = (url: string | null): string | null => {
    if (url === null) return null;
    return rewrite(url) ?? url;
  };

  return {
    ...wedding,
    gallery: wedding.gallery.map((item) => ({ ...item, url: one(item.url) ?? item.url })),
    photos: {
      bride: one(wedding.photos.bride),
      groom: one(wedding.photos.groom),
      couple: one(wedding.photos.couple),
    },
    music: wedding.music ? { ...wedding.music, url: one(wedding.music.url) ?? wedding.music.url } : null,
  };
}
