import { describe, expect, it } from "vitest";

import { mediaFolderForGuest } from "./media-access";
import { mediaPathFromUrl, planMediaMigration } from "./media-migration";
import { mediaUrlForPath } from "./storage";

const WEDDING_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const TOKEN = "vc_token_abcdefghijklmnop";

/** A guest-uploaded object: the folder the builder's upload produced. */
function draftUrl(role: "bride" | "groom" | "couple" | "gallery" | "music", file: string, salt = 7) {
  return mediaUrlForPath(`${mediaFolderForGuest(TOKEN, role, salt)}/${role}/${file}`);
}

const weddingUrl = (role: string, file: string) => mediaUrlForPath(`${WEDDING_ID}/${role}/${file}`);

describe("mediaPathFromUrl", () => {
  it("recovers the key from a relative app media URL", () => {
    expect(mediaPathFromUrl(`/api/media/${WEDDING_ID}/bride/bride.webp`)).toBe(
      `${WEDDING_ID}/bride/bride.webp`
    );
  });

  it("recovers the key from an absolute URL", () => {
    expect(mediaPathFromUrl(`https://example.com/api/media/${WEDDING_ID}/music/song.mp3`)).toBe(
      `${WEDDING_ID}/music/song.mp3`
    );
  });

  it("re-validates decoded segments instead of trusting them", () => {
    // Decoding happens before validation, so an encoded space must not be
    // smuggled through into a storage key.
    expect(mediaPathFromUrl("/api/media/abc-1-2/gallery/a%20b.webp")).toBeNull();
    expect(mediaPathFromUrl("/api/media/abc-1-2/gallery/%2e%2e%2f%2e%2e%2fpasswd")).toBeNull();
  });

  it("rejects anything that is not a well-formed media URL", () => {
    for (const value of [
      undefined,
      null,
      42,
      "",
      "https://example.com/photo.jpg",
      "/api/media/",
      "/api/media/only-one-segment",
      "/api/media/a/b/c/d",
      "/api/media/abc-1-2/secrets/x.webp",
      "/api/media/abc-1-2/bride/..%2f..%2fetc%2fpasswd",
    ]) {
      expect(mediaPathFromUrl(value)).toBeNull();
    }
  });
});

describe("planMediaMigration", () => {
  it("repoints a draft-scoped photo at the wedding folder", () => {
    const { moves, data } = planMediaMigration(WEDDING_ID, {
      bridePhoto: draftUrl("bride", "bride.webp"),
    });

    expect(moves).toEqual([
      {
        role: "bride",
        fromPath: expect.stringMatching(/^[0-9a-f]{16}-1-7\/bride\/bride\.webp$/),
        toPath: `${WEDDING_ID}/bride/bride.webp`,
        toUrl: weddingUrl("bride", "bride.webp"),
        order: undefined,
        copyOnly: false,
      },
    ]);
    expect(data.bridePhoto).toBe(weddingUrl("bride", "bride.webp"));
  });

  it("leaves media already in the wedding folder untouched", () => {
    const input = { bridePhoto: weddingUrl("bride", "bride.webp") };
    const { moves, data } = planMediaMigration(WEDDING_ID, input);

    expect(moves).toEqual([]);
    expect(data.bridePhoto).toBe(weddingUrl("bride", "bride.webp"));
  });

  it("migrates the soundtrack", () => {
    const { moves, data } = planMediaMigration(WEDDING_ID, {
      music: { role: "music", url: draftUrl("music", "song.mp3"), name: "song.mp3" },
    });

    expect(moves.map((m) => m.toPath)).toEqual([`${WEDDING_ID}/music/song.mp3`]);
    expect(data.music).toEqual({
      role: "music",
      url: weddingUrl("music", "song.mp3"),
      name: "song.mp3",
    });
  });

  it("migrates every gallery item and preserves the couple's ordering", () => {
    const { moves, data } = planMediaMigration(WEDDING_ID, {
      gallery: [
        { role: "gallery", url: draftUrl("gallery", "gallery-a1b2c3.webp", 1), name: "one.jpg" },
        { role: "gallery", url: draftUrl("gallery", "gallery-d4e5f6.webp", 2), name: "two.jpg" },
        { role: "gallery", url: draftUrl("gallery", "gallery-g7h8i9.webp", 3), name: "three.jpg" },
      ],
    });

    expect(moves.map((m) => m.order)).toEqual([0, 1, 2]);
    expect(moves.map((m) => m.toPath)).toEqual([
      `${WEDDING_ID}/gallery/gallery-a1b2c3.webp`,
      `${WEDDING_ID}/gallery/gallery-d4e5f6.webp`,
      `${WEDDING_ID}/gallery/gallery-g7h8i9.webp`,
    ]);
    expect((data.gallery as Array<{ url: string }>).map((g) => g.url)).toEqual([
      weddingUrl("gallery", "gallery-a1b2c3.webp"),
      weddingUrl("gallery", "gallery-d4e5f6.webp"),
      weddingUrl("gallery", "gallery-g7h8i9.webp"),
    ]);
  });

  it("does not mutate the caller's object", () => {
    const input = { bridePhoto: draftUrl("bride", "bride.webp") };
    planMediaMigration(WEDDING_ID, input);
    expect(input.bridePhoto).toBe(draftUrl("bride", "bride.webp"));
  });

  it("moves an object referenced twice only once", () => {
    const shared = draftUrl("couple", "couple.webp");
    const { moves, data } = planMediaMigration(WEDDING_ID, {
      couplePhoto: shared,
      gallery: [{ role: "gallery", url: shared, name: "dupe.webp" }],
    });

    expect(moves).toHaveLength(1);
    expect(data.couplePhoto).toBe(weddingUrl("couple", "couple.webp"));
    expect((data.gallery as Array<{ url: string }>)[0].url).toBe(shared);
  });

  it("never collapses two objects onto one destination key", () => {
    // Two draft folders can each hold a `bride.webp`; only one may claim the
    // destination, and the loser must keep its own readable draft URL.
    const { moves, data } = planMediaMigration(WEDDING_ID, {
      bridePhoto: draftUrl("bride", "bride.webp", 1),
      gallery: [{ role: "bride", url: draftUrl("bride", "bride.webp", 2), name: "old.webp" }],
    });

    expect(moves).toHaveLength(1);
    expect(data.bridePhoto).toBe(weddingUrl("bride", "bride.webp"));
    expect((data.gallery as Array<{ url: string }>)[0].url).toBe(draftUrl("bride", "bride.webp", 2));
  });

  it("ignores non-media fields and malformed entries", () => {
    const { moves, data } = planMediaMigration(WEDDING_ID, {
      mapsUrl: "https://maps.google.com/?q=1",
      venue: "The Palace",
      story: "We met in 2019.",
      bridePhoto: null,
      gallery: [null, "not-an-object", { role: "gallery", url: "/api/uploads/nope" }],
    });

    expect(moves).toEqual([]);
    expect(data.mapsUrl).toBe("https://maps.google.com/?q=1");
    expect(data.venue).toBe("The Palace");
    expect(data.story).toBe("We met in 2019.");
  });

  it("tolerates absent and non-object data", () => {
    expect(planMediaMigration(WEDDING_ID, null).moves).toEqual([]);
    expect(planMediaMigration(WEDDING_ID, undefined).data).toEqual({});
  });

  it("rewrites only the moves the caller approves", () => {
    const raw = {
      bridePhoto: draftUrl("bride", "bride.webp", 1),
      groomPhoto: draftUrl("groom", "groom.webp", 2),
    };

    // Models a run where the bride photo moved but the groom photo did not.
    const approved = `${WEDDING_ID}/bride/bride.webp`;
    const { data } = planMediaMigration(WEDDING_ID, raw, (move) => move.toPath === approved);

    expect(data.bridePhoto).toBe(weddingUrl("bride", "bride.webp"));
    expect(data.groomPhoto).toBe(draftUrl("groom", "groom.webp", 2));
  });

  it("is a no-op on a second run over already-migrated data", () => {
    const first = planMediaMigration(WEDDING_ID, {
      bridePhoto: draftUrl("bride", "bride.webp"),
      gallery: [{ role: "gallery", url: draftUrl("gallery", "gallery-abc.webp") }],
    });
    const second = planMediaMigration(WEDDING_ID, first.data);

    expect(second.moves).toEqual([]);
    expect(second.data).toEqual(first.data);
  });
});

describe("library tracks", () => {
  const libraryUrl = (file: string) => mediaUrlForPath(`library/music/${file}`);

  it("copies a library track into the wedding folder rather than moving it", () => {
    // Moving would rip the object out of the catalogue and break every other
    // invitation that picked the same track.
    const { moves, data } = planMediaMigration(WEDDING_ID, {
      music: { role: "music", url: libraryUrl("track-abc.mp3"), name: "First Dance" },
    });

    expect(moves).toHaveLength(1);
    expect(moves[0].copyOnly).toBe(true);
    expect(moves[0].fromPath).toBe("library/music/track-abc.mp3");
    expect(moves[0].toPath).toBe(`${WEDDING_ID}/music/track-abc.mp3`);
    // The wedding's copy is what the invitation plays.
    expect((data.music as { url: string }).url).toBe(mediaUrlForPath(`${WEDDING_ID}/music/track-abc.mp3`));
  });

  it("still copies the library track on a re-run of an already migrated wedding", () => {
    // After the first publish the blob points at the wedding folder, so there is
    // nothing left to do and the catalogue is never touched again.
    const { moves } = planMediaMigration(WEDDING_ID, {
      music: { role: "music", url: mediaUrlForPath(`${WEDDING_ID}/music/track-abc.mp3`) },
    });
    expect(moves).toEqual([]);
  });

  it("does not copy a guest's own upload", () => {
    const { moves } = planMediaMigration(WEDDING_ID, {
      music: { role: "music", url: draftUrl("music", "music.mp3") },
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].copyOnly).toBeFalsy();
  });

  it("copies a library track alongside the couple's own photos", () => {
    const { moves } = planMediaMigration(WEDDING_ID, {
      bridePhoto: draftUrl("bride", "bride.webp"),
      music: { role: "music", url: libraryUrl("track-abc.mp3") },
    });
    expect(moves).toHaveLength(2);
    expect(moves.find((m) => m.role === "music")?.copyOnly).toBe(true);
    expect(moves.find((m) => m.role === "bride")?.copyOnly).toBeFalsy();
  });

  it("ignores a non-audio library object", () => {
    // Only `music` is curated in the library; anything else is not expected and
    // must not silently become wedding media.
    const { moves } = planMediaMigration(WEDDING_ID, {
      bridePhoto: mediaUrlForPath("library/gallery/track-abc.png"),
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].fromPath).toBe("library/gallery/track-abc.png");
  });
});
