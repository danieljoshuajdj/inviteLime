import "server-only";

import { randomUUID } from "node:crypto";

import {
  HERO_IMAGE_PREFIX,
  MAX_HERO_IMAGES,
  mergeHeroContent,
  parseHeroContent,
  reorderHeroImages,
  type HeroContent,
  type HeroContentImage,
  type HeroContentWithUrls,
} from "@/lib/hero-content";
import { validateMediaPackUpload } from "@/lib/services/media-packs";
import { getSetting, updateSetting } from "@/lib/services/site-settings";
import { getObjectStorage, TEMPLATE_BUCKET } from "@/lib/services/storage";
import { publicObjectUrl } from "@/lib/services/storage/urls";

/**
 * The home page's hero content lives in the existing `site_settings` table under
 * the `hero` key. Uploaded carousel images are public product assets, so they go
 * in the templates bucket (the same bucket that already serves template
 * packages) rather than the private weddings bucket.
 *
 * Keys are stored, URLs are derived on read. That keeps Supabase and Backblaze
 * B2 interchangeable: a Supabase URL is stable, while B2 needs a fresh signed
 * URL each time the page renders.
 */

export const HERO_SETTING_KEY = "hero";

/** Reads the stored hero content with defaults applied. */
export async function getHeroContent(): Promise<HeroContent> {
  const stored = await getSetting<unknown>(HERO_SETTING_KEY, {});
  return parseHeroContent(stored);
}

/**
 * Hero content plus a browser-loadable URL per image. A URL that cannot be
 * resolved (missing storage configuration) yields an empty string so the admin
 * can still see and remove the entry, while the public page ignores it.
 */
export async function getHeroContentWithUrls(): Promise<HeroContentWithUrls> {
  return attachHeroImageUrls(await getHeroContent());
}

/** Adds resolved URLs to already-loaded content (used after a save). */
export function attachHeroImageUrls(content: HeroContent): HeroContentWithUrls {
  return {
    ...content,
    images: content.images.map((image) => ({
      ...image,
      url: resolveHeroImageUrl(image.key),
    })),
  };
}

/** Only images that resolve to a URL; used by the public home page. */
export async function getHeroCarouselImages(): Promise<
  Array<{ src: string; alt: string }>
> {
  const { images } = await getHeroContentWithUrls();
  return images
    .filter((image) => image.url.length > 0)
    .map((image) => ({ src: image.url, alt: image.alt }));
}

function resolveHeroImageUrl(key: string): string {
  try {
    return publicObjectUrl(TEMPLATE_BUCKET, key);
  } catch (err) {
    console.warn("[hero-content] could not build an image URL", { key, error: err });
    return "";
  }
}

/** Saves the editable copy, preserving any other fields stored under `hero`. */
export async function saveHeroCopy(input: {
  title: unknown;
  subtitle: unknown;
  eyebrow: unknown;
}): Promise<HeroContent> {
  const existing = await getSetting<unknown>(HERO_SETTING_KEY, {});
  const parsed = parseHeroContent(existing);
  const next: HeroContent = parseHeroContent({
    ...(typeof existing === "object" && existing !== null ? existing : {}),
    title: input.title,
    subtitle: input.subtitle,
    eyebrow: input.eyebrow,
    images: parsed.images,
  });

  await updateSetting(HERO_SETTING_KEY, mergeHeroContent(existing, next));
  return next;
}

/**
 * Validates, optimises and stores one uploaded image, then appends it to the
 * carousel. The image row is only recorded after the object upload succeeded,
 * so a failed upload never leaves a broken entry.
 */
export async function addHeroImage(input: {
  buffer: ArrayBuffer;
  declaredType: string;
  originalName: string;
}): Promise<{ image: HeroContentImage; url: string }> {
  const current = await getHeroContent();
  if (current.images.length >= MAX_HERO_IMAGES) {
    throw new Error(
      `The carousel holds up to ${MAX_HERO_IMAGES} images. Remove one before uploading another.`
    );
  }

  const validated = validateMediaPackUpload(input);
  const optimized = await optimizeHeroImage(input.buffer, validated);

  const key = `${HERO_IMAGE_PREFIX}${randomUUID().replace(/-/g, "")}.${optimized.ext}`;
  const storage = await getObjectStorage();
  await storage.upload(TEMPLATE_BUCKET, key, optimized.body, {
    contentType: optimized.mimeType,
    cacheControl: "3600",
  });

  const image: HeroContentImage = {
    key,
    alt: `Invite Lime digital invitation preview ${current.images.length + 1}`,
  };
  const existing = await getSetting<unknown>(HERO_SETTING_KEY, {});
  const next: HeroContent = { ...current, images: [...current.images, image] };

  try {
    await updateSetting(HERO_SETTING_KEY, mergeHeroContent(existing, next));
  } catch (err) {
    // Never leave an unreferenced object behind when the settings write failed.
    await storage.delete(TEMPLATE_BUCKET, key).catch(() => {});
    throw err;
  }

  return { image, url: resolveHeroImageUrl(key) };
}

/**
 * Removes one image from the carousel and deletes its object. The settings row
 * is updated first so the image disappears immediately; the object delete is
 * best-effort cleanup and a failure only leaves an unreachable file behind.
 */
export async function removeHeroImage(key: unknown): Promise<void> {
  if (typeof key !== "string") throw new Error("Invalid image");

  const current = await getHeroContent();
  const images = current.images.filter((image) => image.key !== key);
  if (images.length === current.images.length) throw new Error("Image not found");

  const existing = await getSetting<unknown>(HERO_SETTING_KEY, {});
  await updateSetting(HERO_SETTING_KEY, mergeHeroContent(existing, { ...current, images }));

  try {
    await (await getObjectStorage()).delete(TEMPLATE_BUCKET, key);
  } catch (err) {
    console.warn("[hero-content] could not remove the image object", { key, error: err });
  }
}

/** Applies a new carousel order. The keys must be a permutation of the current set. */
export async function reorderHeroImagesByKey(keys: unknown): Promise<HeroContent> {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) {
    throw new Error("Invalid image order");
  }

  const current = await getHeroContent();
  const reordered = reorderHeroImages(current.images, keys as string[]);
  if (!reordered) throw new Error("The image order is out of date. Reload and try again.");

  const existing = await getSetting<unknown>(HERO_SETTING_KEY, {});
  const next: HeroContent = { ...current, images: reordered };
  await updateSetting(HERO_SETTING_KEY, mergeHeroContent(existing, next));
  return next;
}

/**
 * Server-side image pipeline: EXIF rotation, a generous max dimension and WebP,
 * matching the media-library rules. GIFs stay as-is so animation survives; any
 * optimizer failure falls back to the original bytes instead of rejecting the
 * upload.
 */
async function optimizeHeroImage(
  buffer: ArrayBuffer,
  validated: { mimeType: string; ext: string }
): Promise<{ body: Buffer; mimeType: string; ext: string }> {
  if (validated.mimeType === "image/gif") {
    return { body: Buffer.from(buffer), mimeType: validated.mimeType, ext: validated.ext };
  }

  try {
    const sharp = (await import("sharp")).default;
    const body = await sharp(Buffer.from(buffer))
      .rotate()
      .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
    return { body, mimeType: "image/webp", ext: "webp" };
  } catch (err) {
    console.warn("[hero-content] image optimization fallback to raw buffer", err);
    return { body: Buffer.from(buffer), mimeType: validated.mimeType, ext: validated.ext };
  }
}
