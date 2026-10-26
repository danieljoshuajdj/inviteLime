import { describe, expect, it } from "vitest";

import { mediaUrlForPath, MEDIA_ROLES, ROLE_SALT, mediaObjectName, ACCUMULATIVE_MEDIA_ROLES } from "./storage";
import { parseMediaPath } from "./media-access";

/**
 * Gallery and video uploads used to write `${role}.${ext}` with `upsert: true`,
 * so every additional image overwrote the one before it while the builder kept
 * appending to `data.gallery` — leaving the whole gallery rendering the same
 * final file. Single-file roles are meant to be replaced, so the naming rule is
 * asserted per role rather than globally.
 */

const WEDDING_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("mediaObjectName", () => {
  it("gives every gallery upload a distinct object name", () => {
    const first = mediaObjectName("gallery", "webp", "1a2b3c4d5e");
    const second = mediaObjectName("gallery", "webp", "6f7e8d9c0b");
    expect(first).toBe("gallery-1a2b3c4d5e.webp");
    expect(first).not.toBe(second);
  });

  it("gives every video upload a distinct object name", () => {
    expect(mediaObjectName("video", "mp4", "1a2b3c4d5e")).not.toBe(
      mediaObjectName("video", "mp4", "6f7e8d9c0b")
    );
  });

  it("keeps single-file roles stable so re-uploading replaces the photo", () => {
    for (const role of ["bride", "groom", "couple", "music"] as const) {
      expect(mediaObjectName(role, "webp", "1a2b3c4d5e")).toBe(`${role}.webp`);
    }
  });

  it("falls back to the plain name when no unique id is supplied", () => {
    expect(mediaObjectName("gallery", "webp")).toBe("gallery.webp");
  });

  it("classifies every role as accumulative or replaceable", () => {
    for (const role of MEDIA_ROLES) {
      const named = mediaObjectName(role, "webp", "abcdef1234");
      const plain = mediaObjectName(role, "webp");
      const isAccumulative = ACCUMULATIVE_MEDIA_ROLES.includes(role);
      expect(named !== plain).toBe(isAccumulative);
    }
  });

  it("keeps generated names inside what the media route accepts", () => {
    const name = mediaObjectName("gallery", "webp", "1a2b3c4d5e");
    expect(parseMediaPath([WEDDING_ID, "gallery", name])).not.toBeNull();
  });
});

describe("role salt table", () => {
  it("covers every media role exactly once", () => {
    expect(Object.keys(ROLE_SALT).sort()).toEqual([...MEDIA_ROLES].sort());
  });

  it("uses distinct salts so a folder identifies its role", () => {
    const salts = Object.values(ROLE_SALT);
    expect(new Set(salts).size).toBe(salts.length);
  });
});

describe("mediaUrlForPath", () => {
  it("addresses a gallery object through the app route", () => {
    const url = mediaUrlForPath(`${WEDDING_ID}/gallery/gallery-1a2b3c4d5e.webp`);
    expect(url).toBe(`/api/media/${WEDDING_ID}/gallery/gallery-1a2b3c4d5e.webp`);
    expect(parseMediaPath([WEDDING_ID, "gallery", "gallery-1a2b3c4d5e.webp"])).not.toBeNull();
  });
});
