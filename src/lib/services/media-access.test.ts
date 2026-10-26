import { describe, expect, it } from "vitest";

import {
  guestFolderMatches,
  isLibraryFolder,
  isWeddingFolder,
  isWeddingMediaRole,
  libraryMediaKey,
  mediaFolderForGuest,
  parseMediaPath,
} from "./media-access";
import { mediaUrlForPath } from "./storage";

const WEDDING_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("parseMediaPath", () => {
  it("accepts a well-formed object key", () => {
    expect(parseMediaPath([WEDDING_ID, "bride", "bride.webp"])).toEqual({
      folder: WEDDING_ID,
      role: "bride",
      file: "bride.webp",
    });
  });

  it("requires exactly three segments", () => {
    expect(parseMediaPath(undefined)).toBeNull();
    expect(parseMediaPath([])).toBeNull();
    expect(parseMediaPath([WEDDING_ID, "bride"])).toBeNull();
    expect(parseMediaPath([WEDDING_ID, "bride", "bride.webp", "extra"])).toBeNull();
  });

  it("rejects an unknown role", () => {
    expect(parseMediaPath([WEDDING_ID, "secrets", "bride.webp"])).toBeNull();
  });

  it("rejects traversal and separator smuggling", () => {
    for (const file of ["..", "../../etc/passwd", "a/b.webp", "bride.webp/../x", "..%2fpasswd"]) {
      expect(parseMediaPath([WEDDING_ID, "bride", file])).toBeNull();
    }
    for (const folder of ["..", `${WEDDING_ID}/..`, "a/b", ".hidden"]) {
      expect(parseMediaPath([folder, "bride", "bride.webp"])).toBeNull();
    }
  });

  it("rejects a file with no extension or odd characters", () => {
    expect(parseMediaPath([WEDDING_ID, "bride", "bride"])).toBeNull();
    expect(parseMediaPath([WEDDING_ID, "bride", "bride.webp;rm"])).toBeNull();
  });
});

describe("mediaFolderForGuest", () => {
  const token = "vc_token_abcdefghijklmnop";

  it("is stable for the same token, role and salt", () => {
    expect(mediaFolderForGuest(token, "gallery", 42)).toBe(mediaFolderForGuest(token, "gallery", 42));
  });

  it("embeds the role salt and the caller's salt", () => {
    expect(mediaFolderForGuest(token, "gallery", 42)).toMatch(/^[0-9a-f]{16}-4-42$/);
    expect(mediaFolderForGuest(token, "bride", 7)).toMatch(/^[0-9a-f]{16}-1-7$/);
  });

  it("never exposes any part of the token", () => {
    const folder = mediaFolderForGuest(token, "bride", 1);
    expect(folder).not.toContain(token.slice(0, 8));
    expect(folder.toLowerCase()).not.toContain("vc_token");
  });

  it("gives different tokens different folders", () => {
    expect(mediaFolderForGuest(token, "bride", 1)).not.toBe(
      mediaFolderForGuest(`${token}x`, "bride", 1)
    );
  });
});

describe("guestFolderMatches", () => {
  const token = "vc_token_abcdefghijklmnop";

  it("accepts the folder the uploader derives from a live token", () => {
    const folder = mediaFolderForGuest(token, "bride", 7);
    expect(guestFolderMatches(folder, "bride", token)).toBe(true);
  });

  it("rejects a folder derived from a different token", () => {
    const folder = mediaFolderForGuest("some_other_token_value", "bride", 7);
    expect(guestFolderMatches(folder, "bride", token)).toBe(false);
  });

  it("rejects a folder whose role does not match the request", () => {
    const folder = mediaFolderForGuest(token, "bride", 7);
    expect(guestFolderMatches(folder, "couple", token)).toBe(false);
  });

  it("rejects an unknown or missing role salt", () => {
    const digest = mediaFolderForGuest(token, "bride", 7).split("-")[0];
    expect(guestFolderMatches(`${digest}-9-7`, "bride", token)).toBe(false);
    expect(guestFolderMatches(`${digest}-x-7`, "bride", token)).toBe(false);
    expect(guestFolderMatches(`${digest}-1`, "bride", token)).toBe(false);
  });

  it("rejects a non-numeric salt", () => {
    const digest = mediaFolderForGuest(token, "bride", 7).split("-")[0];
    expect(guestFolderMatches(`${digest}-1-evil`, "bride", token)).toBe(false);
  });

  it("rejects everything without a token", () => {
    const folder = mediaFolderForGuest(token, "bride", 7);
    expect(guestFolderMatches(folder, "bride", null)).toBe(false);
  });

  it("rejects a wedding UUID folder, which must be authorized as a wedding", () => {
    expect(guestFolderMatches(WEDDING_ID, "bride", token)).toBe(false);
  });
});

describe("isWeddingFolder", () => {
  it("recognises a wedding UUID folder", () => {
    expect(isWeddingFolder(WEDDING_ID)).toBe(true);
    expect(isWeddingFolder(WEDDING_ID.toUpperCase())).toBe(true);
  });

  it("does not treat a guest-draft folder as a wedding", () => {
    expect(isWeddingFolder("abcdefgh-1-7")).toBe(false);
    expect(isWeddingFolder("3f2504e0-4f89-41d3-9a0c")).toBe(false);
  });
});

describe("mediaUrlForPath", () => {
  it("addresses media through the app, not a storage public URL", () => {
    const url = mediaUrlForPath(`${WEDDING_ID}/bride/bride.webp`);
    expect(url).toBe(`/api/media/${WEDDING_ID}/bride/bride.webp`);
    expect(url).not.toContain("supabase.co");
    expect(url).not.toContain("/object/public/");
  });

  it("encodes each segment so a key cannot escape its folder", () => {
    expect(mediaUrlForPath("a b/c?d/e")).toBe("/api/media/a%20b/c%3Fd/e");
  });
});

describe("library folder", () => {
  it("is accepted by the media path parser", () => {
    // If `parseMediaPath` rejected this shape, every library read would 404.
    expect(parseMediaPath(["library", "music", "trackabc.mp3"])).toEqual({
      folder: "library",
      role: "music",
      file: "trackabc.mp3",
    });
  });

  it("is distinguished from a wedding folder", () => {
    expect(isWeddingFolder("library")).toBe(false);
    expect(isLibraryFolder("library")).toBe(true);
  });

  it("is not mistaken for a guest draft folder", () => {
    // "library" is not a uuid and never matches a token digest, so it must not
    // be reachable through the draft authorization path.
    expect(isLibraryFolder("library")).toBe(true);
    expect(isLibraryFolder("abcdef0123456789-5-9")).toBe(false);
    expect(guestFolderMatches("library", "music", "token")).toBe(false);
  });

  it("rejects a library traversal attempt", () => {
    expect(parseMediaPath(["library", "music", "../../etc/passwd"])).toBeNull();
    expect(parseMediaPath(["..", "music", "track.mp3"])).toBeNull();
  });
});

describe("library media-pack role", () => {
  it("is accepted inside the library folder", () => {
    expect(parseMediaPath(["library", "media", "photoabc.webp"])).toEqual({
      folder: "library",
      role: "media",
      file: "photoabc.webp",
    });
  });

  it("is rejected inside a wedding or guest-draft folder", () => {
    // Guests never upload a "media" role, so a wedding or draft folder must not
    // be able to claim it.
    expect(parseMediaPath([WEDDING_ID, "media", "photo.webp"])).toBeNull();
    expect(parseMediaPath(["abcdefgh-1-7", "media", "photo.webp"])).toBeNull();
  });

  it("is never treated as a wedding upload role", () => {
    expect(isWeddingMediaRole("media")).toBe(false);
    for (const role of ["bride", "groom", "couple", "gallery", "music", "video"] as const) {
      expect(isWeddingMediaRole(role)).toBe(true);
    }
  });
});

describe("libraryMediaKey", () => {
  it("places photos in the library's media folder", () => {
    // Like `libraryMusicKey`, the basename is sanitised to alphanumerics only,
    // so the "photo-" prefix the service adds is flattened to "photo".
    expect(libraryMediaKey("photo-abc123", "webp")).toBe("library/media/photoabc123.webp");
  });

  it("produces a key the media path parser accepts", () => {
    expect(parseMediaPath(libraryMediaKey("photo-abc123", "jpg").split("/"))).toEqual({
      folder: "library",
      role: "media",
      file: "photoabc123.jpg",
    });
  });

  it("keeps the webp default when the extension is missing", () => {
    expect(libraryMediaKey("photo-abc123", "")).toBe("library/media/photoabc123.webp");
  });

  it("strips characters that would break the path", () => {
    // The "photo-" prefix is added by callers, so a traversal attempt collapses
    // into the basename instead of escaping the folder.
    expect(libraryMediaKey("photo-../../etc", "webp")).toBe("library/media/photoetc.webp");
    expect(libraryMediaKey("photo-a/../b", "webp")).toBe("library/media/photoab.webp");
  });
});
