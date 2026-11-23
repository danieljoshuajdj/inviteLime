/**
 * Central application-origin resolution.
 *
 * The app is served from several legitimate origins over its lifetime:
 * loopback in local development, a rotating VS Code / tunnel hostname while
 * testing on a phone, staging, and the canonical production domain. A single
 * static `NEXT_PUBLIC_APP_URL` cannot describe all of them: when it is set to
 * localhost, a tunneled request still renders localhost media URLs, which the
 * phone cannot load.
 *
 * Two different answers are therefore needed:
 *
 * * **Runtime origin** — the origin the browser actually used. Absolute media
 *   URLs, `assets.baseUrl` and preview links must point here so they stay
 *   same-origin, avoid mixed content and remain reachable through a tunnel.
 * * **Public origin** — the origin for permanent links (canonical, Open Graph,
 *   emails, share links). When a real canonical domain is configured it always
 *   wins, so a development tunnel can never leak into production metadata.
 *
 * Request headers are only trusted after the resulting hostname matches an
 * explicit allow-list: the configured origin, `TRUSTED_APP_ORIGINS`, loopback,
 * or (in non-production only) a recognised development-tunnel suffix. An
 * attacker-supplied `Host` / `X-Forwarded-Host` therefore cannot inject an
 * arbitrary origin into server-rendered HTML.
 *
 * Kept free of `next/headers` and `server-only` so the rules can be unit tested
 * directly; request-scoped wrappers live in `app-origin-server.ts`.
 */

export const LOCAL_APP_ORIGIN = "http://localhost:3000";

export interface HeaderReader {
  get(name: string): string | null;
}

export interface AppOriginOptions {
  /** Injectable environment for tests; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** Injectable NODE_ENV for tests; defaults to the environment value. */
  nodeEnv?: string;
}

interface HostPattern {
  hostname: string;
  wildcard: boolean;
}

/**
 * Development tunnel suffixes trusted automatically outside production.
 * The identifier changes on every tunnel, so matching the suffix (never a
 * concrete hostname) keeps the code independent of the current tunnel.
 * Any other provider can be added through `TRUSTED_APP_ORIGINS`.
 */
const DEV_TUNNEL_HOST_SUFFIXES = ["devtunnels.ms"] as const;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const HOSTNAME_RE =
  /^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/i;
const HOST_RE =
  /^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)(?::\d{1,5})?$/i;

function envOf(options?: AppOriginOptions): Record<string, string | undefined> {
  return options?.env ?? process.env;
}

function nodeEnvOf(options?: AppOriginOptions): string {
  return options?.nodeEnv ?? envOf(options).NODE_ENV ?? "development";
}

function bareHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLoopbackHostname(hostname: string): boolean {
  const host = bareHostname(hostname);
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

function isDevTunnelHostname(hostname: string): boolean {
  const host = bareHostname(hostname);
  return DEV_TUNNEL_HOST_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`));
}

/**
 * Parses a value that must be a bare HTTP(S) origin. Paths, query strings,
 * fragments and credentials are rejected rather than silently discarded, so a
 * misconfigured env value can never smuggle extra URL structure into rendered
 * links.
 */
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || CONTROL_CHARS.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.hostname.includes("*")) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The configured canonical origin, when `NEXT_PUBLIC_APP_URL` is valid. */
export function configuredAppOrigin(
  env: Record<string, string | undefined> = process.env
): string | null {
  return normalizeOrigin(env.NEXT_PUBLIC_APP_URL);
}

/** True for loopback origins, which are never useful as production links. */
export function isLocalOrigin(origin: unknown): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return isLoopbackHostname(new URL(normalized).hostname);
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function hostFromHeaders(headers: HeaderReader): string | null {
  // A tunnel/reverse proxy exposes the browser-facing hostname in
  // X-Forwarded-Host; the raw Host header is the fallback for direct requests.
  const raw =
    firstHeaderValue(headers.get("x-forwarded-host")) ??
    firstHeaderValue(headers.get("host"));
  if (!raw) return null;
  if (CONTROL_CHARS.test(raw) || /[\s/\\?#@]/.test(raw)) return null;
  if (!HOST_RE.test(raw)) return null;
  return raw.toLowerCase();
}

function hostnameOf(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host.toLowerCase() : host.slice(1, end).toLowerCase();
  }
  return host.split(":")[0].toLowerCase();
}

function parseHostPattern(raw: string): HostPattern | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  let hostname: string;
  const schemeAt = value.indexOf("://");
  if (schemeAt !== -1) {
    const protocol = value.slice(0, schemeAt);
    if (protocol !== "http" && protocol !== "https") return null;
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      if (url.pathname !== "/" || url.search || url.hash) return null;
      hostname = url.hostname;
    } catch {
      return null;
    }
  } else {
    if (/[/\\?#@\s]/.test(value)) return null;
    hostname = value;
  }

  hostname = bareHostname(hostname);

  if (hostname.startsWith("*.")) {
    const suffix = hostname.slice(2);
    if (!suffix || suffix.includes("*") || !HOSTNAME_RE.test(suffix)) return null;
    return { hostname: suffix, wildcard: true };
  }

  if (hostname.includes("*") || !HOSTNAME_RE.test(hostname)) return null;
  return { hostname, wildcard: false };
}

function trustedHostPatterns(options?: AppOriginOptions): HostPattern[] {
  const env = envOf(options);
  const patterns: HostPattern[] = [];

  const configured = configuredAppOrigin(env);
  if (configured) {
    patterns.push({
      hostname: bareHostname(new URL(configured).hostname),
      wildcard: false,
    });
  }

  for (const entry of (env.TRUSTED_APP_ORIGINS ?? "").split(",")) {
    const parsed = parseHostPattern(entry);
    if (parsed) patterns.push(parsed);
  }

  // Development tunnels are only trusted outside production. A production
  // deployment that genuinely needs one can opt in through TRUSTED_APP_ORIGINS.
  if (nodeEnvOf(options) !== "production") {
    for (const suffix of DEV_TUNNEL_HOST_SUFFIXES) {
      patterns.push({ hostname: suffix, wildcard: true });
    }
  }

  return patterns;
}

/** Whether a request hostname may be used as a public origin. */
export function isTrustedRequestHost(
  hostname: string,
  options?: AppOriginOptions
): boolean {
  const host = bareHostname(hostname);
  if (isLoopbackHostname(host)) return true;

  return trustedHostPatterns(options).some((pattern) =>
    pattern.wildcard
      ? host.endsWith(`.${pattern.hostname}`)
      : host === pattern.hostname
  );
}

function requestProtocol(
  headers: HeaderReader,
  hostname: string,
  nodeEnv: string
): "http:" | "https:" {
  const forwarded = firstHeaderValue(headers.get("x-forwarded-proto"))?.toLowerCase();
  if (forwarded === "http" || forwarded === "https") {
    return `${forwarded}:` as "http:" | "https:";
  }

  const forwardedSsl = firstHeaderValue(headers.get("x-forwarded-ssl"))?.toLowerCase();
  if (forwardedSsl === "on") return "https:";

  // Loopback is plain HTTP. Tunnel hostnames are HTTPS by construction even
  // when the forwarded-proto header is absent, which avoids mixed content.
  if (isLoopbackHostname(hostname)) return "http:";
  if (isDevTunnelHostname(hostname)) return "https:";
  return nodeEnv === "production" ? "https:" : "http:";
}

/**
 * The validated browser-facing origin for this request, or null when the
 * request carries no usable/trusted host.
 */
export function requestAppOrigin(
  headers: HeaderReader,
  options?: AppOriginOptions
): string | null {
  const host = hostFromHeaders(headers);
  if (!host) return null;

  const hostname = hostnameOf(host);
  if (!isTrustedRequestHost(hostname, options)) return null;

  const protocol = requestProtocol(headers, hostname, nodeEnvOf(options));
  try {
    const url = new URL(`${protocol}//${host}`);
    return url.hostname ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Origin for browser-loaded runtime assets (media, template-facing links).
 * The request origin wins so a tunnel preview remains reachable even when the
 * configured canonical origin points at production.
 */
export function resolveRuntimeAppOrigin(
  headers: HeaderReader | null | undefined,
  options?: AppOriginOptions
): string {
  return (
    (headers ? requestAppOrigin(headers, options) : null) ??
    configuredAppOrigin(envOf(options)) ??
    LOCAL_APP_ORIGIN
  );
}

/**
 * Origin for permanent public links (canonical, Open Graph, email, share).
 * A configured non-loopback domain always wins; otherwise the validated
 * request origin is used so localhost development still produces working
 * tunnel links.
 */
export function resolvePublicAppOrigin(
  headers: HeaderReader | null | undefined,
  options?: AppOriginOptions
): string {
  const configured = configuredAppOrigin(envOf(options));
  if (configured && !isLocalOrigin(configured)) return configured;

  return (
    (headers ? requestAppOrigin(headers, options) : null) ??
    configured ??
    LOCAL_APP_ORIGIN
  );
}

/**
 * Origin for code paths with no incoming request (webhooks, background jobs).
 * Only the configured canonical value is safe there.
 */
export function resolveConfiguredAppOrigin(options?: AppOriginOptions): string {
  return configuredAppOrigin(envOf(options)) ?? LOCAL_APP_ORIGIN;
}
