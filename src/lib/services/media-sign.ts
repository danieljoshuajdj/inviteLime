import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signatures for draft media served by `/api/media`.
 *
 * A guest's un-published preview renders inside a `srcDoc` frame sandboxed
 * without `allow-same-origin`, so that frame has an opaque origin and cannot
 * send the `vc_guest_token` cookie which is otherwise the only thing that
 * authorizes a draft-scoped object. The signature is the capability that stands
 * in for the cookie, so the payload the preview receives carries signed URLs.
 *
 * Two properties matter:
 *
 * * The subject is one exact object key, so a signature minted for a bride photo
 *   can never be replayed to read a gallery image or a soundtrack.
 * * The window is an hour, which outlasts a builder session's worth of
 *   re-renders without turning the URL into a durable link.
 *
 * The template asset proxy signs the same secret, so the digest input is
 * domain-separated: a signature is only ever valid for the proxy that minted it.
 */

const MEDIA_SIGNATURE_TTL_SECONDS = 60 * 60;

const FALLBACK_SECRET = "invite-lime-template-assets-signing-secret";

function signingSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SECRET;
}

function hmacFor(exp: number, subject: string): string {
  return createHmac("sha256", signingSecret())
    .update(`media:${exp}:${subject}`)
    .digest("hex");
}

/**
 * Signs a single media object key (`{folder}/{role}/{file}`). The result travels
 * as the `sig` query parameter and is emitted as `${expSeconds}.${hex}`.
 */
export function signMediaToken(subject: string): string {
  const exp = Math.floor(Date.now() / 1000) + MEDIA_SIGNATURE_TTL_SECONDS;
  return `${exp}.${hmacFor(exp, subject)}`;
}

export function verifyMediaToken(token: string, subject: string): boolean {
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
