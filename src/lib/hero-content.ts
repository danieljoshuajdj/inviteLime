/**
 * Home-page hero content.
 *
 * The public home page reads its headline, supporting copy and carousel images
 * from the `hero` row of `site_settings`. This module holds the validation and
 * defaults and is intentionally dependency-free so the admin form (browser) and
 * the API (server) share one set of rules.
 *
 * Images are stored by object key, never by URL: the storage backend may be
 * Supabase (public bucket URL) or Backblaze B2 (short-lived signed URL), and a
 * stored signed URL would stop working after it expired.
 */

/** Prefix every admin-uploaded hero image lives under. */
export const HERO_IMAGE_PREFIX = "site/hero/";

/** The carousel renders at most this many images; extra uploads are refused. */
export const MAX_HERO_IMAGES = 5;

export const MAX_HERO_TITLE_LENGTH = 160;
export const MAX_HERO_SUBTITLE_LENGTH = 400;
export const MAX_HERO_EYEBROW_LENGTH = 80;
export const MAX_HERO_ALT_LENGTH = 160;
export const MAX_HERO_IMAGE_KEY_LENGTH = 300;

export interface HeroContentImage {
  /** Storage object key, e.g. `site/hero/ab12cd.webp`. */
  key: string;
  /** Accessible description for the rendered carousel image. */
  alt: string;
}

export interface HeroContent {
  title: string;
  subtitle: string;
  eyebrow: string;
  images: HeroContentImage[];
}

/** Image with a resolved, browser-loadable URL. */
export interface HeroContentImageWithUrl extends HeroContentImage {
  url: string;
}

export interface HeroContentWithUrls extends Omit<HeroContent, "images"> {
  images: HeroContentImageWithUrl[];
}

/**
 * Copy the home page has always shown. Kept here so a database row that predates
 * the editor, or one with a cleared field, still renders complete content.
 */
export const DEFAULT_HERO_CONTENT: HeroContent = {
  title: "Create a Breathtaking Wedding Website",
  subtitle:
    "Design an enchanting digital invitation in minutes. Choose from couture animated templates, add your ceremonies, music, and registry, and share a personalized link that opens instantly on every smartphone.",
  eyebrow: "Trusted for 5,00,000+ happy couples",
  images: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

/**
 * True for keys this feature is allowed to touch. Rejecting everything else
 * means a tampered request can never delete or overwrite an object outside the
 * hero prefix.
 */
export function isHeroImageKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_HERO_IMAGE_KEY_LENGTH) return false;
  if (!value.startsWith(HERO_IMAGE_PREFIX)) return false;
  if (value.includes("..") || value.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return value.slice(HERO_IMAGE_PREFIX.length).length > 0;
}

/** Default alt text for an image the admin did not describe. */
export function defaultHeroImageAlt(index: number): string {
  return `Invite Lime digital invitation preview ${index + 1}`;
}

function parseImages(value: unknown): HeroContentImage[] {
  if (!Array.isArray(value)) return [];

  const images: HeroContentImage[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (images.length >= MAX_HERO_IMAGES) break;

    const key = isRecord(entry) ? entry.key : entry;
    if (!isHeroImageKey(key) || seen.has(key)) continue;

    const rawAlt = isRecord(entry) ? entry.alt : undefined;
    const alt =
      typeof rawAlt === "string" && rawAlt.trim()
        ? rawAlt.trim().slice(0, MAX_HERO_ALT_LENGTH)
        : defaultHeroImageAlt(images.length);

    seen.add(key);
    images.push({ key, alt });
  }

  return images;
}

/**
 * Reads the stored `hero` value into complete content. Unknown and malformed
 * fields fall back to the shipped copy instead of rendering blanks.
 */
export function parseHeroContent(value: unknown): HeroContent {
  const record = isRecord(value) ? value : {};
  return {
    title: readText(record.title, DEFAULT_HERO_CONTENT.title, MAX_HERO_TITLE_LENGTH),
    subtitle: readText(
      record.subtitle,
      DEFAULT_HERO_CONTENT.subtitle,
      MAX_HERO_SUBTITLE_LENGTH
    ),
    eyebrow: readText(record.eyebrow, DEFAULT_HERO_CONTENT.eyebrow, MAX_HERO_EYEBROW_LENGTH),
    images: parseImages(record.images),
  };
}

/**
 * Merges edited copy into the stored `hero` row while preserving fields this
 * editor does not own (older deployments stored extra marketing values there).
 */
export function mergeHeroContent(existing: unknown, next: HeroContent): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  return {
    ...base,
    title: next.title,
    subtitle: next.subtitle,
    eyebrow: next.eyebrow,
    images: next.images.map(({ key, alt }) => ({ key, alt })),
  };
}

/**
 * Reorders images to the requested key order.
 *
 * The request must be a permutation of the current keys: an unknown key is
 * rejected rather than silently dropped, so a stale admin tab cannot delete an
 * image that was uploaded after it loaded.
 */
export function reorderHeroImages(
  current: readonly HeroContentImage[],
  requestedKeys: readonly string[]
): HeroContentImage[] | null {
  if (requestedKeys.length !== current.length) return null;

  const byKey = new Map(current.map((image) => [image.key, image]));
  const reordered: HeroContentImage[] = [];

  for (const key of requestedKeys) {
    const image = byKey.get(key);
    if (!image) return null;
    byKey.delete(key);
    reordered.push(image);
  }

  return byKey.size === 0 ? reordered : null;
}
