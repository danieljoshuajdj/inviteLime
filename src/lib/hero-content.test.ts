import { describe, expect, it } from "vitest";

import {
  DEFAULT_HERO_CONTENT,
  HERO_IMAGE_PREFIX,
  MAX_HERO_IMAGES,
  isHeroImageKey,
  mergeHeroContent,
  parseHeroContent,
  reorderHeroImages,
  type HeroContentImage,
} from "./hero-content";

const key = (name: string) => `${HERO_IMAGE_PREFIX}${name}.webp`;

describe("parseHeroContent", () => {
  it("returns the shipped copy for missing or malformed settings", () => {
    expect(parseHeroContent(null)).toEqual(DEFAULT_HERO_CONTENT);
    expect(parseHeroContent("oops")).toEqual(DEFAULT_HERO_CONTENT);
    expect(parseHeroContent({})).toEqual(DEFAULT_HERO_CONTENT);
  });

  it("keeps edited copy, trimming it and falling back on blank fields", () => {
    const parsed = parseHeroContent({
      title: "  A new headline  ",
      subtitle: "   ",
      eyebrow: "  Just launched  ",
    });

    expect(parsed.title).toBe("A new headline");
    expect(parsed.subtitle).toBe(DEFAULT_HERO_CONTENT.subtitle);
    expect(parsed.eyebrow).toBe("Just launched");
  });

  it("drops images outside the hero prefix, duplicates and unsafe keys", () => {
    const parsed = parseHeroContent({
      images: [
        { key: key("one"), alt: " First " },
        { key: key("one"), alt: "Duplicate" },
        { key: "library/media/other.webp" },
        { key: `${HERO_IMAGE_PREFIX}../escape.webp` },
        { key: `${HERO_IMAGE_PREFIX}back\\slash.webp` },
        key("two"),
      ],
    });

    expect(parsed.images).toEqual([
      { key: key("one"), alt: "First" },
      { key: key("two"), alt: "Invite Lime digital invitation preview 2" },
    ]);
  });

  it("caps the carousel at the maximum number of images", () => {
    const parsed = parseHeroContent({
      images: Array.from({ length: MAX_HERO_IMAGES + 3 }, (_, index) => key(`image-${index}`)),
    });
    expect(parsed.images).toHaveLength(MAX_HERO_IMAGES);
  });
});

describe("mergeHeroContent", () => {
  it("writes owned fields while preserving unrelated stored values", () => {
    const existing = { title: "Old", show_badge: true, legacy: { a: 1 } };
    const next = parseHeroContent({
      title: "New",
      subtitle: "Copy",
      eyebrow: "Eyebrow",
      images: [{ key: key("one"), alt: "One" }],
    });

    expect(mergeHeroContent(existing, next)).toEqual({
      title: "New",
      subtitle: "Copy",
      eyebrow: "Eyebrow",
      images: [{ key: key("one"), alt: "One" }],
      show_badge: true,
      legacy: { a: 1 },
    });
  });

  it("does not persist extra fields attached to image entries", () => {
    const next = parseHeroContent({ images: [{ key: key("one"), alt: "One" }] });
    const merged = mergeHeroContent({}, {
      ...next,
      images: [{ ...next.images[0], secret: "x" } as HeroContentImage],
    });

    expect(merged.images).toEqual([{ key: key("one"), alt: "One" }]);
  });
});

describe("reorderHeroImages", () => {
  const images: HeroContentImage[] = [
    { key: key("one"), alt: "One" },
    { key: key("two"), alt: "Two" },
    { key: key("three"), alt: "Three" },
  ];

  it("returns images in the requested order", () => {
    expect(reorderHeroImages(images, [key("three"), key("one"), key("two")])).toEqual([
      images[2],
      images[0],
      images[1],
    ]);
  });

  it("rejects orders that are not a permutation of the current set", () => {
    expect(reorderHeroImages(images, [key("one"), key("two")])).toBeNull();
    expect(reorderHeroImages(images, [key("one"), key("two"), key("missing")])).toBeNull();
    expect(
      reorderHeroImages(images, [key("one"), key("one"), key("two")])
    ).toBeNull();
  });
});

describe("isHeroImageKey", () => {
  it("accepts only keys inside the hero prefix", () => {
    expect(isHeroImageKey(key("one"))).toBe(true);
    expect(isHeroImageKey(`${HERO_IMAGE_PREFIX}one`)).toBe(true);
    expect(isHeroImageKey("library/media/one.webp")).toBe(false);
    expect(isHeroImageKey(HERO_IMAGE_PREFIX)).toBe(false);
    expect(isHeroImageKey(`${HERO_IMAGE_PREFIX}../one.webp`)).toBe(false);
    expect(isHeroImageKey(42)).toBe(false);
  });
});
