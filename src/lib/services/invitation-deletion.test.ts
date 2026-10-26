import { describe, expect, it } from "vitest";

import { mediaKeysInWeddingData, planWeddingObjectDeletion } from "./invitation-deletion";
import { mediaFolderForGuest } from "./media-access";

const WEDDING_ID = "11111111-2222-3333-4444-555555555555";
const TOKEN = "a".repeat(64);

describe("planWeddingObjectDeletion", () => {
  it("always enumerates the wedding's own folder", () => {
    const plan = planWeddingObjectDeletion({ weddingId: WEDDING_ID });
    expect(plan.prefixes).toContain(`${WEDDING_ID}/`);
    expect(plan.explicitKeys).toEqual([]);
  });

  it("adds one prefix per guest session, covering every role and salt", () => {
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      guestAccessTokens: [TOKEN],
    });
    const draftPrefixes = plan.prefixes.filter((p) => !p.startsWith(`${WEDDING_ID}/`));
    expect(draftPrefixes).toHaveLength(1);
    // The prefix is the digest alone, so it matches the bride, gallery and
    // music folders that session uploaded under.
    expect(draftPrefixes[0]).toMatch(/^[0-9a-f]{16}-$/);
    expect(mediaFolderForGuest(TOKEN, "gallery", 12345).startsWith(draftPrefixes[0])).toBe(true);
    expect(mediaFolderForGuest(TOKEN, "bride", 1).startsWith(draftPrefixes[0])).toBe(true);
  });

  it("skips null and duplicate tokens", () => {
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      guestAccessTokens: [null, TOKEN, TOKEN, null],
    });
    expect(plan.prefixes.filter((p) => !p.startsWith(`${WEDDING_ID}/`))).toHaveLength(1);
  });

  it("does not re-list keys already covered by an enumerated prefix", () => {
    const key = `${WEDDING_ID}/gallery/gallery-abc123.webp`;
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      recordedKeys: [key],
    });
    expect(plan.explicitKeys).toEqual([]);
  });

  it("honours a recorded key that lives outside every prefix", () => {
    // e.g. media recorded before a migration moved it elsewhere.
    const key = "99999999-8888-7777-6666-555555555555/music/music-xyz.webp";
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      recordedKeys: [key],
    });
    expect(plan.explicitKeys).toEqual([key]);
  });

  it("ignores recorded keys that are not well-formed object keys", () => {
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      recordedKeys: [
        "",
        null as unknown as string,
        "../../etc/passwd",
        "not-a-key",
        // Traversal inside an otherwise valid shape is still rejected.
        `${WEDDING_ID}/gallery/../../secrets.webp`,
      ] as string[],
    });
    expect(plan.explicitKeys).toEqual([]);
  });

  it("de-duplicates repeated recorded keys", () => {
    const key = "99999999-8888-7777-6666-555555555555/gallery/a.webp";
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      recordedKeys: [key, key],
    });
    expect(plan.explicitKeys).toEqual([key]);
  });
});
describe("library objects are never purged", () => {
  it("excludes a library track even when it is listed as a recorded key", () => {
    // A shared library object must survive any one invitation's deletion, since
    // other invitations still point at it. Its key is otherwise
    // indistinguishable from ordinary media, so the exclusion is explicit.
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      recordedKeys: ["library/music/track-abc.mp3"],
    });
    expect(plan.explicitKeys).not.toContain("library/music/track-abc.mp3");
    expect(plan.prefixes.some((p) => "library/music/track-abc.mp3".startsWith(p))).toBe(false);
  });

  it("still purges the wedding's own copy of a library track", () => {
    // Publishing copies the track into the wedding folder; that copy is the
    // wedding's own media and goes with it.
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      recordedKeys: [`${WEDDING_ID}/music/track-abc.mp3`],
    });
    expect(plan.prefixes).toContain(`${WEDDING_ID}/`);
  });

  it("does not enumerate the library folder as a prefix", () => {
    const plan = planWeddingObjectDeletion({
      weddingId: WEDDING_ID,
      guestAccessTokens: [TOKEN],
    });
    expect(plan.prefixes).not.toContain("library/");
    expect(plan.prefixes).not.toContain("library/music/");
  });
});

describe("mediaKeysInWeddingData", () => {
  const DRAFT_FOLDER = "0123456789abcdef-1-1";

  it("recovers the storage key from every slot the builder writes", () => {
    const keys = mediaKeysInWeddingData({
      bridePhoto: `/api/media/${WEDDING_ID}/bride/bride-1.webp`,
      groomPhoto: `https://app.example.com/api/media/${WEDDING_ID}/groom/groom-1.webp`,
      couplePhoto: `/api/media/${DRAFT_FOLDER}/couple/couple-1.webp`,
      gallery: [
        { url: `/api/media/${DRAFT_FOLDER}/gallery/gallery-1.webp` },
        { url: `/api/media/${DRAFT_FOLDER}/gallery/gallery-2.webp`, caption: "first dance" },
      ],
      music: { url: `/api/media/${DRAFT_FOLDER}/music/music-1.mp3`, title: "Our song" },
    });

    expect(keys).toEqual([
      `${WEDDING_ID}/bride/bride-1.webp`,
      `${WEDDING_ID}/groom/groom-1.webp`,
      `${DRAFT_FOLDER}/couple/couple-1.webp`,
      `${DRAFT_FOLDER}/gallery/gallery-1.webp`,
      `${DRAFT_FOLDER}/gallery/gallery-2.webp`,
      `${DRAFT_FOLDER}/music/music-1.mp3`,
    ]);
  });

  it("ignores external URLs, unrelated fields and malformed entries", () => {
    const keys = mediaKeysInWeddingData({
      bridePhoto: "https://example.com/photo.jpg",
      groomPhoto: null,
      couplePhoto: 42,
      gallery: [null, "not-an-object", { url: "https://example.com/g.jpg" }],
      music: { title: "no url here" },
      // Only the media slots are harvested; an unrelated key must not become
      // a deletion candidate.
      somethingElse: `/api/media/${WEDDING_ID}/bride/bride-1.webp`,
    });

    expect(keys).toEqual([]);
  });

  it("handles a missing blob", () => {
    expect(mediaKeysInWeddingData(null)).toEqual([]);
    expect(mediaKeysInWeddingData(undefined)).toEqual([]);
  });
});
