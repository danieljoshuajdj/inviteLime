/**
 * Pure helpers for the invitation template runtime.
 *
 * Templates are independent HTML/CSS/JS packages. The platform owns data,
 * auth, storage and publishing; the template owns presentation. These helpers
 * build the standardized payload every template receives and inject it into
 * the template's own HTML so a template never needs platform credentials.
 *
 * This module is intentionally dependency-free (no `server-only`) so it can
 * be unit tested and reused on both sides of the boundary.
 */

import { createBindingScript } from "./binding";
import { normalizeWhatsappNumber } from "@/lib/phone";
import { templatePackageBaseUrl } from "@/lib/services/storage/urls";

export const RUNTIME_CONTRACT_VERSION = "1.0";

export interface RuntimeEvent {
  name: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  address: string | null;
  mapsUrl: string | null;
  description: string | null;
}

export interface RuntimeGalleryItem {
  url: string;
  name?: string;
}

/** One side of a dress-code card: a swatch colour plus its display name. */
export interface RuntimeDressSide {
  color: string | null;
  colorName: string | null;
}

export interface RuntimeDress {
  bride: RuntimeDressSide;
  groom: RuntimeDressSide;
}

export interface RuntimePlannerBrand {
  brandName: string;
  contactPhone: string;
  address: string | null;
  mapsUrl: string | null;
}

export interface RuntimePayload {
  runtime: "invite-lime";
  contract: string;
  mode: "live" | "demo";
  /** Only public invitation data ever reaches a template. */
  wedding: {
    id: string;
    slug: string;
    brideName: string;
    groomName: string;
    brideBio: string;
    groomBio: string;
    coupleBio: string;
    story: string;
    date: string;
    time: string | null;
    venue: string;
    address: string;
    mapsUrl: string | null;
    latitude: number | null;
    longitude: number | null;
    events: RuntimeEvent[];
    gallery: RuntimeGalleryItem[];
    photos: { bride: string | null; groom: string | null; couple: string | null };
    music: RuntimeGalleryItem | null;
    /**
     * Richer demo content. Null on live invitations until the builder collects
     * these fields; templates must treat them as optional.
     */
    brideDesignation: string | null;
    groomDesignation: string | null;
    dress: RuntimeDress | null;
  };
  invitation: {
    url: string;
    expiresAt: string | null;
  };
  rsvp: {
    enabled: boolean;
    /**
     * True in demo and guest-preview mode. The template can render the form,
     * but submissions are intentionally not written to a real wedding.
     */
    preview: boolean;
    deadline: string | null;
    attendingCount: number;
    responseCount: number;
    endpoint: string;
    /** Demo-only RSVP contact details; null on live invitations. */
    contactName: string | null;
    contactPhone: string | null;
    whatsapp: string | null;
    /** Digits-only customer WhatsApp number used for the prefilled RSVP chat. */
    whatsappNumber: string | null;
  };
  /**
   * Present only on planner-created invitations. Null on demo and
   * customer-owned invitations so studio branding can never leak.
   */
  planner: RuntimePlannerBrand | null;
  assets: {
    baseUrl: string;
  };
}

export interface RuntimeWeddingInput {
  id: string;
  slug: string;
  brideName: string;
  groomName: string;
  date: string;
  time: string | null;
  venue: string;
  address: string;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  brideBio: string;
  groomBio: string;
  coupleBio: string;
  story: string;
  events: RuntimeEvent[];
  gallery: RuntimeGalleryItem[];
  photos: { bride: string | null; groom: string | null; couple: string | null };
  music: RuntimeGalleryItem | null;
  brideDesignation?: string | null;
  groomDesignation?: string | null;
  dress?: RuntimeDress | null;
}

export function buildRuntimePayload(input: {
  wedding: RuntimeWeddingInput;
  mode: "live" | "demo";
  invitationUrl: string;
  expiresAt?: string | null;
  assetsBaseUrl: string;
  planner?: RuntimePlannerBrand | null;
  rsvp?: {
    enabled?: boolean;
    preview?: boolean;
    deadline?: string | null;
    attendingCount?: number;
    responseCount?: number;
    endpoint?: string;
    contactName?: string | null;
    contactPhone?: string | null;
    whatsapp?: string | null;
    whatsappNumber?: string | null;
  };
}): RuntimePayload {
  return {
    runtime: "invite-lime",
    contract: RUNTIME_CONTRACT_VERSION,
    mode: input.mode,
    wedding: {
      ...input.wedding,
      brideDesignation: input.wedding.brideDesignation ?? null,
      groomDesignation: input.wedding.groomDesignation ?? null,
      dress: input.wedding.dress ?? null,
    },
    invitation: {
      url: input.invitationUrl,
      expiresAt: input.expiresAt ?? null,
    },
    rsvp: {
      enabled: input.rsvp?.enabled ?? false,
      preview: input.rsvp?.preview ?? false,
      deadline: input.rsvp?.deadline ?? null,
      attendingCount: input.rsvp?.attendingCount ?? 0,
      responseCount: input.rsvp?.responseCount ?? 0,
      endpoint: input.rsvp?.endpoint ?? "/api/rsvp",
      contactName: input.rsvp?.contactName ?? null,
      contactPhone: input.rsvp?.contactPhone ?? null,
      whatsapp: input.rsvp?.whatsapp ?? null,
      whatsappNumber: normalizeWhatsappNumber(input.rsvp?.whatsappNumber),
    },
    planner: input.planner
      ? {
          brandName: input.planner.brandName.trim(),
          contactPhone: input.planner.contactPhone.trim(),
          address: input.planner.address?.trim() || null,
          mapsUrl: input.planner.mapsUrl?.trim() || null,
        }
      : null,
    assets: {
      baseUrl: withTrailingSlash(input.assetsBaseUrl),
    },
  };
}

/**
 * Public URL prefix of a template version, e.g. `templates/{id}/v1.0.0/`.
 * Built from the active storage backend: Backblaze B2 public base when
 * configured, otherwise the Supabase Storage public URL.
 */
export function templateAssetBaseUrl(storagePrefix: string): string {
  return templatePackageBaseUrl(storagePrefix);
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

const MARKER = "data-invite-lime-runtime";
const GALLERY_MARKER = "data-invite-lime-gallery";

/**
 * The gallery section, as templates are expected to mark it. Both first-party
 * template packages use this and the template contract calls the gallery an
 * optional section.
 */
export const GALLERY_SECTION_SELECTOR = '[data-section="gallery"]';

/**
 * Optional content must disappear cleanly ("CONDITIONAL RENDERING" in the
 * platform contract): `gallery.length === 0` means hide the gallery, not an
 * empty photo frame.
 *
 * A template may do that itself, but its gallery section is visible from first
 * paint — the section markup carries no `hidden` attribute — so a template that
 * hides it only once its own script has run still flashes an empty gallery, and
 * one that skips the check leaves it on the invitation. When a live invitation
 * has no photos the platform therefore hides the gallery section up front.
 *
 * Demo mode is exempt: a template is allowed to show its own demo media.
 */
export function gallerySectionStyle(payload: RuntimePayload): string {
  if (payload.mode !== "live") return "";
  if ((payload.wedding.gallery ?? []).length > 0) return "";
  return `<style ${GALLERY_MARKER}="1">${GALLERY_SECTION_SELECTOR}{display:none!important}</style>`;
}

/** Escapes a JSON blob so it is safe to embed inside a <script> tag. */
export function serializePayload(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safePlannerHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Last-resort branding for templates published before planner slots existed.
 *
 * New templates mark at least one element with `data-planner-slot` and render
 * the brand themselves. Older packages get a compact credit band at the top of
 * the document and a footer band, injected only when the payload has a planner.
 */
function plannerFallbackSnippet(planner: RuntimePlannerBrand): string {
  const brand = escapeHtml(planner.brandName);
  const phone = escapeHtml(planner.contactPhone);
  const tel = escapeHtml(planner.contactPhone.replace(/[^\d+]/g, ""));
  const address = planner.address ? escapeHtml(planner.address) : "";
  const maps = safePlannerHref(planner.mapsUrl);
  const addressLine = address
    ? `<div style="margin-top:4px;opacity:.86">${address}</div>`
    : "";
  const mapAction = maps
    ? `<a href="${escapeHtml(maps)}" target="_blank" rel="noopener noreferrer">View map</a>`
    : "";

  return `<style data-planner-fallback="1">
    .invite-lime-planner-credit{position:fixed;z-index:2147483000;top:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:8px;padding:7px 14px;background:rgba(24,20,16,.88);color:#f7efe2;font:500 10px/1.3 ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;text-align:center;backdrop-filter:blur(8px)}
    .invite-lime-planner-credit strong{font-weight:700;letter-spacing:.08em}
    .invite-lime-planner-footer{background:#181410;color:#f7efe2;padding:20px 18px 24px;text-align:center;font:400 12px/1.6 ui-sans-serif,system-ui,sans-serif}
    .invite-lime-planner-footer strong{display:block;font:600 14px/1.4 ui-serif,Georgia,serif;letter-spacing:.04em;margin-bottom:4px}
    .invite-lime-planner-footer a{display:inline-block;margin:10px 4px 0;padding:8px 14px;border:1px solid rgba(247,239,226,.4);border-radius:999px;color:inherit;text-decoration:none;font-size:10px;letter-spacing:.14em;text-transform:uppercase}
    body{padding-top:34px!important}
  </style>
  <div class="invite-lime-planner-credit"><span>Presented by</span><strong>${brand}</strong></div>
  <footer class="invite-lime-planner-footer">
    <strong>${brand}</strong>
    <div>${phone}</div>
    ${addressLine}
    <div><a data-planner-fallback-call href="tel:${tel}">Call the studio</a>${mapAction}</div>
  </footer>
  <script>(function(){var a=document.querySelector("[data-planner-fallback-call]");if(!a)return;a.addEventListener("click",function(e){e.preventDefault();try{parent.postMessage({type:"invite-lime:external-link",href:a.getAttribute("href")},"*");}catch(err){window.location.href=a.getAttribute("href");}});})();</script>`;
}

/**
 * Injects the runtime payload + a <base> tag into a template's HTML document.
 *
 * * `<base href>` makes relative asset paths (`assets/images/...`) resolve to
 *   the immutable template package in object storage.
 * * The payload is exposed as `window.__INVITE_LIME_RUNTIME__` and re-broadcast
 *   as an `invite-lime:data` event / `postMessage` for templates that prefer
 *   event-driven bootstrapping.
 * * When a live invitation has no gallery photos, a style rule hides the
 *   template's gallery section (see `gallerySectionStyle`) so the optional
 *   section can never appear empty.
 *
 * Idempotent: calling it twice returns the first result unchanged.
 */
export function injectRuntimePayload(
  html: string,
  options: { baseHref: string; payload: RuntimePayload }
): string {
  if (html.includes(MARKER)) return html;

  const base = `<base href="${escapeAttribute(options.baseHref)}">`;
  const galleryStyle = gallerySectionStyle(options.payload);
  const boot =
    `<script ${MARKER}="1">` +
    `(function(){var d=${serializePayload(options.payload)};` +
    `window.__INVITE_LIME_RUNTIME__=d;` +
    `var send=function(){try{parent.postMessage({type:"invite-lime:data",payload:d},"*");}catch(e){}};` +
    `send();document.addEventListener("DOMContentLoaded",function(){send();` +
    `try{window.dispatchEvent(new CustomEvent("invite-lime:data",{detail:d}));}catch(e){}});` +
    `})();</script>`;

  // Runs after the bootstrap, so window.__INVITE_LIME_RUNTIME__ already exists.
  const binder = `<script>${createBindingScript()}</script>`;

  const snippet = `${base}${galleryStyle}${boot}${binder}`;
  const planner = options.payload.planner;
  const plannerFallback =
    planner && !/data-planner-slot/i.test(html) ? plannerFallbackSnippet(planner) : "";

  if (/<head[^>]*>/i.test(html)) {
    const withHead = html.replace(/<head([^>]*)>/i, (match) => `${match}${snippet}`);
    if (!plannerFallback) return withHead;
    return /<\/body>/i.test(withHead)
      ? withHead.replace(/<\/body>/i, `${plannerFallback}</body>`)
      : `${withHead}${plannerFallback}`;
  }
  if (/<html[^>]*>/i.test(html)) {
    const withHead = html.replace(/<html([^>]*)>/i, (match) => `${match}<head>${snippet}</head>`);
    if (!plannerFallback) return withHead;
    return /<\/body>/i.test(withHead)
      ? withHead.replace(/<\/body>/i, `${plannerFallback}</body>`)
      : `${withHead}${plannerFallback}`;
  }
  return `${snippet}${plannerFallback}${html}`;
}

/** Conservative check so a missing entry file never breaks the public page. */
export function looksLikeHtmlDocument(html: string): boolean {
  const sample = html.slice(0, 2000).toLowerCase();
  return sample.includes("<html") || sample.includes("<!doctype") || sample.includes("<body");
}
