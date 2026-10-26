import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signatures for the template asset proxy (`/api/templates`).
 *
 * Templates are delivered from a private Backblaze B2 bucket, so browsers can
 * never address an object directly. Instead the runtime injects a signed,
 * expiring base href into the template HTML; every relative asset the template
 * requests resolves back onto the proxy, which re-verifies the signature
 * before streaming the bytes.
 *
 * The signature commits to the immutable version folder (`{templateId}/v{n}`
 * or `{templateId}/thumbnail`) rather than one object per file, so the
 * `<base href>` mechanism stays intact while the signed window stays narrow.
 */

const SIGNATURE_TTL_SECONDS = 12 * 60 * 60;

const FALLBACK_SECRET = "invite-lime-template-assets-signing-secret";

function signingSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SECRET;
}

function canonicalPath(subject: string): string {
  return subject
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function hmacFor(exp: number, subject: string): string {
  return createHmac("sha256", signingSecret())
    .update(`${exp}:${canonicalPath(subject)}`)
    .digest("hex");
}

/**
 * Signs a template path subject with an expiry window. The result is embedded
 * in proxy URLs as `${expSeconds}.${hex}`.
 */
export function signTemplateAssetToken(subject: string): string {
  const exp = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
  return `${exp}.${hmacFor(exp, subject)}`;
}

export function verifyTemplateAssetToken(token: string, subject: string): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const signature = token.slice(dot + 1);
  const expected = hmacFor(exp, subject);
  if (signature.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(signature, "utf8"),
    Buffer.from(expected, "utf8")
  );
}

/**
 * The folder a proxy request is scoped to: the first two key segments
 * (`{templateId}/v{n}` for a package, `{templateId}/thumbnail` for a preview).
 */
export function templateAssetSubject(key: string): string {
  const segments = canonicalPath(key).split("/");
  return segments.slice(0, 2).join("/");
}