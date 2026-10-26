import { describe, expect, it, vi } from "vitest";

import { mediaFolderForGuest } from "./media-access";
import { absolutizeMediaUrl, mediaObjectKey, rewriteRuntimeMedia, signDraftMediaUrl } from "./media-urls";
import type { RuntimeWeddingInput } from "@/lib/runtime/payload";

const APP_URL = "https://app.example.com";
const GUEST_TOKEN = "vc_token_abcdefghijklmnop";
const OTHER_GUEST_TOKEN = "vc_token_zyxwvutsrqponmlk";
const GUEST_FOLDER = mediaFolderForGuest(GUEST_TOKEN, "gallery", 12345);
const OTHER_GUEST_FOLDER = mediaFolderForGuest(OTHER_GUEST_TOKEN, "gallery", 12345);
const WEDDING_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function makeWedding(input: Partial<RuntimeWeddingInput> = {}): RuntimeWeddingInput {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "royal-mughal",
    brideName: "Meera",
    groomName: "Aarav",
    date: "2027-02-14",
    time: "19:00",
    venue: "Palace Gardens",
    address: "12 Lake Road",
    mapsUrl: null,
    latitude: null,
    longitude: null,
    brideBio: "",
    groomBio: "",
    coupleBio: "",
    story: "",
    events: [],
    gallery: [],
    photos: { bride: null, groom: null, couple: null },
    music: null,
    ...input,
  };
}

describe("mediaObjectKey", () => {
  it("extracts the storage key from app-relative media URLs", () => {
    const url = `/api/media/${GUEST_FOLDER}/gallery/gallery-c41270cc20.webp`;
    expect(mediaObjectKey(url)).toBe(`${GUEST_FOLDER}/gallery/gallery-c41270cc20.webp`);
  });

  it("accepts absolute URLs", () => {
    const url = `${APP_URL}/api/media/${WEDDING_ID}/bride/bride.jpg`;
    expect(mediaObjectKey(url)).toBe(`${WEDDING_ID}/bride/bride.jpg`);
  });

  it("ignores other hosts and schemes", () => {
    expect(mediaObjectKey("https://cdn.example.com/a.jpg")).toBeNull();
    expect(mediaObjectKey("javascript:alert(1)")).toBeNull();
  });
});

describe("absolutizeMediaUrl", () => {
  it("turns an app-relative path into an absolute one", () => {
    const out = absolutizeMediaUrl(`/api/media/${WEDDING_ID}/bride/bride.webp`, APP_URL);
    expect(out).toBe(`${APP_URL}/api/media/${WEDDING_ID}/bride/bride.webp`);
  });

  it("preserves an already absolute URL's key", () => {
    const out = absolutizeMediaUrl(`${APP_URL}/api/media/${WEDDING_ID}/gallery/a.webp`, APP_URL);
    expect(out).toBe(`${APP_URL}/api/media/${WEDDING_ID}/gallery/a.webp`);
  });

  it("strips a trailing slash from the app origin", () => {
    const out = absolutizeMediaUrl(`/api/media/${WEDDING_ID}/bride/bride.webp`, `${APP_URL}/`);
    expect(out).toBe(`${APP_URL}/api/media/${WEDDING_ID}/bride/bride.webp`);
  });

  it("rejects non-media URLs", () => {
    expect(absolutizeMediaUrl("https://cdn.example.com/a.jpg", APP_URL)).toBeNull();
  });
});

describe("signDraftMediaUrl", () => {
  it("signs a draft-scoped key with a short-lived token", () => {
    const sig = vi.fn((subject: string) => `1234567890.${subject.split("/").join("-")}`);
    const url = `/api/media/${GUEST_FOLDER}/gallery/g1.webp`;
    const out = signDraftMediaUrl(url, { appUrl: APP_URL, guestToken: GUEST_TOKEN, sign: sig });
    expect(out).toBe(
      `${APP_URL}/api/media/${GUEST_FOLDER}/gallery/g1.webp?sig=1234567890.${GUEST_FOLDER}-gallery-g1.webp`
    );
    expect(sig).toHaveBeenCalledTimes(1);
    expect(sig).toHaveBeenCalledWith(`${GUEST_FOLDER}/gallery/g1.webp`);
  });

  it("signs a role only when the folder really encodes that role", () => {
    // A folder is derived from a role, so a mismatched role is not this
    // session's folder and must not be signed.
    const sig = vi.fn();
    const out = signDraftMediaUrl(`/api/media/${GUEST_FOLDER}/music/song.mp3`, {
      appUrl: APP_URL,
      guestToken: GUEST_TOKEN,
      sign: sig,
    });
    expect(out).toBeNull();
    expect(sig).not.toHaveBeenCalled();
  });

  it("does not sign a wedding folder", () => {
    const sig = vi.fn();
    const url = `/api/media/${WEDDING_ID}/couple/couple.webp`;
    const out = signDraftMediaUrl(url, { appUrl: APP_URL, guestToken: GUEST_TOKEN, sign: sig });
    expect(out).toBe(`${APP_URL}/api/media/${WEDDING_ID}/couple/couple.webp`);
    expect(sig).not.toHaveBeenCalled();
  });

  it("does not sign when there is no guest token", () => {
    const sig = vi.fn();
    const url = `/api/media/${GUEST_FOLDER}/gallery/g1.webp`;
    const out = signDraftMediaUrl(url, { appUrl: APP_URL, guestToken: null, sign: sig });
    expect(out).toBe(`${APP_URL}/api/media/${GUEST_FOLDER}/gallery/g1.webp`);
    expect(sig).not.toHaveBeenCalled();
  });

  it("rejects signing a folder not owned by the guest token", () => {
    const sig = vi.fn();
    const url = `/api/media/${OTHER_GUEST_FOLDER}/gallery/g1.webp`;
    const out = signDraftMediaUrl(url, { appUrl: APP_URL, guestToken: GUEST_TOKEN, sign: sig });
    expect(out).toBeNull();
    expect(sig).not.toHaveBeenCalled();
  });

  it("rejects non-media URLs", () => {
    const sig = vi.fn();
    expect(signDraftMediaUrl("https://cdn.example.com/a.jpg", { appUrl: APP_URL, guestToken: GUEST_TOKEN, sign: sig })).toBeNull();
  });
});

describe("rewriteRuntimeMedia", () => {
  it("rewrites all media slots", () => {
    const wedding = makeWedding({
      gallery: [
        { url: `/api/media/${GUEST_FOLDER}/gallery/1.webp`, name: "1.webp" },
        { url: `/api/media/${GUEST_FOLDER}/gallery/2.webp`, name: "2.webp" },
      ],
      photos: {
        bride: `/api/media/${GUEST_FOLDER}/bride/bride.webp`,
        groom: `/api/media/${GUEST_FOLDER}/groom/groom.webp`,
        couple: `/api/media/${GUEST_FOLDER}/couple/couple.webp`,
      },
      music: { url: `/api/media/${GUEST_FOLDER}/music/song.mp3`, name: "song.mp3" },
    });

    const result = rewriteRuntimeMedia(wedding, (url) => `${url}?rewritten=1`);
    expect(result.gallery[0].url).toContain("?rewritten=1");
    expect(result.gallery[1].url).toContain("?rewritten=1");
    expect(result.photos.bride).toContain("bride.webp?rewritten=1");
    expect(result.photos.groom).toContain("groom.webp?rewritten=1");
    expect(result.photos.couple).toContain("couple.webp?rewritten=1");
    expect(result.music?.url).toContain("song.mp3?rewritten=1");
  });

  it("leaves external URLs and nulls alone", () => {
    const wedding = makeWedding({
      gallery: [{ url: "https://cdn.example.com/a.jpg", name: "a.jpg" }],
      photos: { bride: null, groom: "https://cdn.example.com/b.jpg", couple: null },
    });
    const result = rewriteRuntimeMedia(wedding, () => null);
    expect(result.gallery[0].url).toBe("https://cdn.example.com/a.jpg");
    expect(result.photos.bride).toBeNull();
    expect(result.photos.groom).toBe("https://cdn.example.com/b.jpg");
  });
});
