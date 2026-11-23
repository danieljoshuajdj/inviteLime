/**
 * Global "Visit Our Website" redirect.
 *
 * Templates receive one permanent platform link (`/visit-website`), never the
 * destination itself. The destination is read from `site_settings` on every
 * redirect, so changing it in the admin panel updates every invitation that
 * already exists without republishing a template.
 *
 * This module is intentionally dependency-free so the same validation runs in
 * the admin form (browser) and in the API/redirect route (server).
 */

/** Permanent path templates point at. The host is added at render time. */
export const WEBSITE_REDIRECT_PATH = "/visit-website";

/** Longest accepted destination; keeps the setting and redirects sane. */
export const MAX_WEBSITE_URL_LENGTH = 2048;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const BACKSLASH = /\\/;

function isIpHostname(hostname: string): boolean {
  // URL.hostname keeps IPv6 brackets.
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

/**
 * A website destination must be a real host, not a single word such as
 * "mywebsite" (almost always a typo). Localhost and IP addresses are allowed so
 * the redirect can be tested against a local site.
 */
function isAcceptableHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || isIpHostname(host) || host.includes(".");
}

/**
 * Normalises an admin-entered website address to an absolute HTTP(S) URL.
 *
 * Accepts a bare domain (`example.com` → `https://example.com/`), a host:port
 * pair and a full URL with a path/query. Rejects every other scheme,
 * credentials, control characters and obviously malformed hosts. Returns
 * `null` for blank/invalid input; blank means "no destination configured".
 */
export function normalizeWebsiteDestination(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_WEBSITE_URL_LENGTH) return null;
  if (CONTROL_CHARS.test(candidate) || BACKSLASH.test(candidate)) return null;
  // Protocol-relative input would inherit whatever origin the admin happens to
  // be on, which is never what a saved global destination should mean.
  if (candidate.startsWith("//")) return null;

  let parsed: URL | null = null;
  try {
    parsed = new URL(candidate);
  } catch {
    parsed = null;
  }

  // `example.com:8080` parses as a URL with the bogus protocol `example.com:`
  // and no host, so only a parsed non-HTTP URL that actually has a host is a
  // real scheme we must reject (`ftp://…`, for example).
  if (parsed && parsed.host && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (!parsed || !parsed.host) {
    try {
      parsed = new URL(`https://${candidate.replace(/^\/+/, "")}`);
    } catch {
      return null;
    }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname || !isAcceptableHostname(parsed.hostname)) return null;

  return parsed.toString();
}

/**
 * Absolute permanent link a template should bind to. The destination itself is
 * never placed in template data; only this stable platform URL is.
 */
export function websiteRedirectHref(origin: string): string {
  return `${origin.trim().replace(/\/+$/, "")}${WEBSITE_REDIRECT_PATH}`;
}
