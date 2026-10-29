/**
 * Declarative template data binding.
 *
 * A template author marks placeholders in plain HTML:
 *
 *   <h1 data-wedding="couple.bride.name"></h1>
 *   <img data-wedding-image="couple.bride.photo">
 *   <a data-wedding-href="wedding.mapsUrl">View Location</a>
 *
 * and the platform fills them in. Templates never query the database and never
 * see platform credentials; they only receive public invitation data.
 *
 * Binding happens inside the template document rather than by rewriting the HTML
 * on the server: the frame is served through `srcDoc` with `sandbox` and no
 * `allow-same-origin`, and parsing untrusted template markup server-side would
 * mean either a fragile regex pass or a new HTML parser dependency.
 */

/**
 * Canonical binding paths from the template contract, mapped onto the runtime
 * payload's actual shape. Paths that already exist in the payload (wedding.*,
 * rsvp.*, invitation.*) resolve directly and need no entry here.
 */
const PATH_ALIASES = new Map<string, string>([
  ["couple.bride.name", "wedding.brideName"],
  ["couple.groom.name", "wedding.groomName"],
  ["couple.bride.bio", "wedding.brideBio"],
  ["couple.groom.bio", "wedding.groomBio"],
  ["couple.bride.photo", "wedding.photos.bride"],
  ["couple.groom.photo", "wedding.photos.groom"],
  ["couple.couplePhoto", "wedding.photos.couple"],
  ["couple.story", "wedding.story"],
  ["celebrant.name", "wedding.celebrantName"],
  ["celebrant.photo", "wedding.photos.main"],
  ["birthday.person.name", "wedding.celebrantName"],
  ["birthday.number", "wedding.birthdayNumber"],
  ["birthday.ordinal", "wedding.birthdayOrdinal"],
  ["birthday.message", "wedding.specialMessage"],
  ["birthday.mainPhoto", "wedding.photos.main"],
]);

/** URL prefixes a template may be handed. Everything else is dropped. */
const SAFE_URL_PREFIX = /^(?:https?:|mailto:|tel:|\/|#)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

export const TEXT_ATTRIBUTE = "data-wedding";
export const IMAGE_ATTRIBUTE = "data-wedding-image";
export const HREF_ATTRIBUTE = "data-wedding-href";

/** Control characters can smuggle a scheme past a prefix check. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * Walks a dotted path. Returns undefined when any segment is missing.
 *
 * Only own properties are readable. A plain lookup would walk the prototype
 * chain, so a template asking for `constructor` would get `Object` and could
 * serialize framework internals into the invitation.
 */
export function readPath(source: unknown, path: string): unknown {
  if (source === null || source === undefined) return undefined;
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object" && typeof current !== "function") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Resolves a binding path to display text, or null when there is nothing to
 * show. Objects are never stringified into the page.
 */
export function resolveBinding(payload: unknown, path: string): string | null {
  if (typeof path !== "string" || path.trim() === "") return null;

  let value = readPath(payload, path);
  if (value === undefined) {
    const alias = PATH_ALIASES.get(path);
    if (alias) value = readPath(payload, alias);
  }

  if (value === null || value === undefined) return null;
  if (typeof value === "object" || typeof value === "function") return null;

  return String(value);
}

/**
 * Filters a value before it becomes an `src` or `href`. Template data is
 * guest-supplied, so an unchecked value would let a couple inject a
 * `javascript:` URL into their own invitation — and, through a shared link,
 * into every guest's browser.
 */
export function sanitizeBindingUrl(value: string | null): string | null {
  if (value === null) return null;
  const candidate = value.trim();
  if (candidate === "") return null;
  if (hasControlChars(candidate)) return null;
  if (SAFE_URL_PREFIX.test(candidate)) return candidate;
  // A scheme we do not allow, or no scheme at all (a relative asset path).
  if (HAS_SCHEME.test(candidate)) return null;
  return candidate;
}

/**
 * The browser-side binder.
 *
 * Deliberately self-contained: it is serialized with `Function.prototype
 * .toString()` and evaluated inside the template document, so it must not
 * reference anything from this module's scope.
 */
function inviteLimeBindingRuntime(): void {
  const ALIASES = new Map<string, string>([
    ["couple.bride.name", "wedding.brideName"],
    ["couple.groom.name", "wedding.groomName"],
    ["couple.bride.bio", "wedding.brideBio"],
    ["couple.groom.bio", "wedding.groomBio"],
    ["couple.bride.photo", "wedding.photos.bride"],
    ["couple.groom.photo", "wedding.photos.groom"],
    ["couple.couplePhoto", "wedding.photos.couple"],
    ["couple.story", "wedding.story"],
    ["celebrant.name", "wedding.celebrantName"],
    ["celebrant.photo", "wedding.photos.main"],
    ["birthday.person.name", "wedding.celebrantName"],
    ["birthday.number", "wedding.birthdayNumber"],
    ["birthday.ordinal", "wedding.birthdayOrdinal"],
    ["birthday.message", "wedding.specialMessage"],
    ["birthday.mainPhoto", "wedding.photos.main"],
  ]);
  const SAFE_URL = /^(?:https?:|mailto:|tel:|\/|#)/i;
  const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

  function hasControl(s: string): boolean {
    for (let i = 0; i < s.length; i += 1) {
      const code = s.charCodeAt(i);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  function readPath(source: unknown, path: string): unknown {
    if (source === null || source === undefined) return undefined;
    let current: unknown = source;
    const parts = path.split(".");
    for (let i = 0; i < parts.length; i += 1) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object" && typeof current !== "function") return undefined;
      // Own properties only, so a template cannot reach Object.prototype.
      if (!Object.prototype.hasOwnProperty.call(current, parts[i])) return undefined;
      current = (current as Record<string, unknown>)[parts[i]];
    }
    return current;
  }

  function resolve(payload: unknown, path: unknown): string | null {
    if (typeof path !== "string" || path.trim() === "") return null;
    let value = readPath(payload, path);
    const alias = ALIASES.get(path);
    if (value === undefined && alias !== undefined) value = readPath(payload, alias);
    if (value === null || value === undefined) return null;
    if (typeof value === "object" || typeof value === "function") return null;
    return String(value);
  }

  function safeUrl(value: string | null): string | null {
    if (value === null) return null;
    const candidate = value.trim();
    if (candidate === "") return null;
    if (hasControl(candidate)) return null;
    if (SAFE_URL.test(candidate)) return candidate;
    if (HAS_SCHEME.test(candidate)) return null;
    return candidate;
  }

  function apply(): void {
    const runtime = (window as unknown as { __INVITE_LIME_RUNTIME__?: unknown }).__INVITE_LIME_RUNTIME__;

    document.querySelectorAll("[data-wedding]").forEach((node) => {
      const value = resolve(runtime, node.getAttribute("data-wedding"));
      if (value !== null) node.textContent = value;
    });

    document.querySelectorAll("[data-wedding-image]").forEach((node) => {
      const url = safeUrl(resolve(runtime, node.getAttribute("data-wedding-image")));
      if (url) node.setAttribute("src", url);
    });

    document.querySelectorAll("[data-wedding-href]").forEach((node) => {
      const url = safeUrl(resolve(runtime, node.getAttribute("data-wedding-href")));
      if (url) node.setAttribute("href", url);
    });
  }

  (window as unknown as { __INVITE_LIME_BIND__?: () => void }).__INVITE_LIME_BIND__ = apply;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }

  // Re-bind when the platform re-broadcasts the payload (the frame posts it on
  // load, and a template may update it later).
  window.addEventListener("invite-lime:data", apply);
}

/**
 * Script source injected after the payload bootstrap. It reads
 * `window.__INVITE_LIME_RUNTIME__`, which the bootstrap has already set.
 */
export function createBindingScript(): string {
  return `(${inviteLimeBindingRuntime.toString()})();`;
}
