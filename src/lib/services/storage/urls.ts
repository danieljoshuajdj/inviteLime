import { TEMPLATE_BUCKET } from "./buckets";
import { signTemplateAssetToken, templateAssetSubject } from "./sign";

/** Server route that streams template assets out of the private B2 bucket. */
export const TEMPLATE_PROXY_ROUTE = "/api/templates";

/**
 * Whether Backblaze B2 is selected as the object storage backend.
 *
 * B2 is used once a B2 endpoint and an application key pair are configured.
 * B2 buckets stay private; templates reach browsers through the signed
 * `/api/templates` proxy, wedding media through `/api/media`.
 */
export function isBackblazeConfigured(): boolean {
  return Boolean(
    process.env.B2_ENDPOINT &&
      process.env.B2_KEY_ID &&
      process.env.B2_APPLICATION_KEY
  );
}

/**
 * URL at which a browser can load a template asset when B2 is active.
 *
 * Both B2 buckets are private, so instead of a public origin this returns a
 * path onto the `/api/templates` proxy with a short-lived signature scoped to
 * the immutable version folder. The proxy streams the bytes server-side.
 *
 * - Backblaze B2: `/api/templates/{signature}/{encodedKey}`. Only the public
 *   template bucket is allowed here — wedding media is never exposed.
 * - Supabase: the standard `/storage/v1/object/public/{bucket}/{key}` URL
 *   (the Supabase `templates` bucket is public by design).
 */
export function publicObjectUrl(bucket: string, key: string): string {
  const trimmedKey = key.replace(/^\/+/, "");

  if (isBackblazeConfigured()) {
    if (bucket !== TEMPLATE_BUCKET) {
      throw new Error(
        `publicObjectUrl is only supported for the ${TEMPLATE_BUCKET} bucket; ` +
          "wedding media must be read through /api/media."
      );
    }
    const token = signTemplateAssetToken(templateAssetSubject(trimmedKey));
    return `${TEMPLATE_PROXY_ROUTE}/${token}/${encodeKey(trimmedKey)}`;
  }

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required to build public object URLs."
    );
  }
  return `${base}/storage/v1/object/public/${bucket}/${trimmedKey}`;
}

/**
 * Base URL of a template version's package folder (trailing slash), so
 * relative asset references inside a template resolve against it.
 *
 * With B2 the returned path is a signed `/api/templates` proxy URL so the
 * browser can request the entry document and every relative asset.
 */
export function templatePackageBaseUrl(storagePrefix: string): string {
  const prefix = storagePrefix.replace(/^\/+|\/+$/g, "");

  if (isBackblazeConfigured()) {
    const token = signTemplateAssetToken(templateAssetSubject(prefix));
    return `${TEMPLATE_PROXY_ROUTE}/${token}/${encodeKey(prefix)}/`;
  }

  const root = publicObjectUrl(TEMPLATE_BUCKET, "").replace(/\/+$/, "");
  return `${root}/${prefix}/`;
}

/** Percent-encodes each path segment so keys survive a URL round trip. */
function encodeKey(key: string): string {
  return key
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}