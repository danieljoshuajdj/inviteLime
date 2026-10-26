import { describe, expect, it } from "vitest";

import { mediaFolderForGuest } from "./media-access";
import { mediaUrlForPath } from "./storage";
import {
  isMediaSafeForLiveWedding,
  reconcileMediaForLiveWedding,
  weddingColumnsFromData,
} from "./wedding-media-reconcile";

const WEDDING_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const OTHER_WEDDING_ID = "8a1f5a30-0e3b-4e5a-9e4c-2d2f7a6b1c44";
const TOKEN = "vc_token_abcdefghijklmnop";

function draftUrl(role: "bride" | "groom" | "couple" | "gallery" | "music", file: string, salt = 7) {
  return mediaUrlForPath(`${mediaFolderForGuest(TOKEN, role, salt)}/${role}/${file}`);
}

function weddingUrl(folder: string, role: string, file: string) {
  return mediaUrlForPath(`${folder}/${role}/${file}`);
}

describe("isMediaSafeForLiveWedding", () => {
  it("accepts this wedding's objects, shared library tracks and external URLs", () => {
    expect(isMediaSafeForLiveWedding(weddingUrl(WEDDING_ID, "bride", "bride.webp"), WEDDING_ID)).toBe(true);
    expect(
      isMediaSafeForLiveWedding(mediaUrlForPath("library/music/track-abc.mp3"), WEDDING_ID)
    ).toBe(true);
    expect(isMediaSafeForLiveWedding("https://cdn.example.com/photo.jpg", WEDDING_ID)).toBe(true);
  });

  it("rejects draft folders and another wedding's objects", () => {
    expect(isMediaSafeForLiveWedding(draftUrl("bride", "bride.webp"), WEDDING_ID)).toBe(false);
    expect(
      isMediaSafeForLiveWedding(weddingUrl(OTHER_WEDDING_ID, "bride", "bride.webp"), WEDDING_ID)
    ).toBe(false);
  });
});

describe("reconcileMediaForLiveWedding", () => {
  it("replaces a stale draft portrait with the published one", () => {
    const published = weddingUrl(WEDDING_ID, "bride", "bride.webp");
    const data = reconcileMediaForLiveWedding(
      WEDDING_ID,
      { bridePhoto: draftUrl("bride", "bride.webp"), story: "Still us" },
      { bridePhoto: published }
    );

    expect(data.bridePhoto).toBe(published);
    expect(data.story).toBe("Still us");
  });

  it("keeps a new wedding-scoped upload and removes a deliberately cleared slot", () => {
    const newUpload = weddingUrl(WEDDING_ID, "groom", "groom-new.webp");
    const data = reconcileMediaForLiveWedding(
      WEDDING_ID,
      { groomPhoto: newUpload },
      { groomPhoto: weddingUrl(WEDDING_ID, "groom", "groom-old.webp") }
    );

    expect(data.groomPhoto).toBe(newUpload);
    expect(data).not.toHaveProperty("bridePhoto");
  });

  it("matches stale gallery items by file name so removal and ordering survive", () => {
    const a = weddingUrl(WEDDING_ID, "gallery", "gallery-a.webp");
    const b = weddingUrl(WEDDING_ID, "gallery", "gallery-b.webp");
    const c = weddingUrl(WEDDING_ID, "gallery", "gallery-c.webp");
    const data = reconcileMediaForLiveWedding(
      WEDDING_ID,
      {
        gallery: [
          { role: "gallery", url: draftUrl("gallery", "gallery-c.webp"), name: "c.jpg" },
          { role: "gallery", url: draftUrl("gallery", "gallery-a.webp"), name: "a.jpg" },
        ],
      },
      {
        gallery: [
          { role: "gallery", url: a, name: "a.jpg" },
          { role: "gallery", url: b, name: "b.jpg" },
          { role: "gallery", url: c, name: "c.jpg" },
        ],
      }
    );

    expect(data.gallery).toEqual([
      { role: "gallery", url: c, name: "c.jpg" },
      { role: "gallery", url: a, name: "a.jpg" },
    ]);
  });

  it("keeps a newly uploaded gallery item alongside migrated ones", () => {
    const existing = weddingUrl(WEDDING_ID, "gallery", "gallery-a.webp");
    const fresh = weddingUrl(WEDDING_ID, "gallery", "gallery-new.webp");
    const data = reconcileMediaForLiveWedding(
      WEDDING_ID,
      {
        gallery: [
          { role: "gallery", url: draftUrl("gallery", "gallery-a.webp"), name: "a.jpg" },
          { role: "gallery", url: fresh, name: "new.jpg" },
        ],
      },
      { gallery: [{ role: "gallery", url: existing, name: "a.jpg" }] }
    );

    expect((data.gallery as Array<{ url: string }>).map((item) => item.url)).toEqual([
      existing,
      fresh,
    ]);
  });

  it("falls back to the published soundtrack", () => {
    const published = { role: "music", url: weddingUrl(WEDDING_ID, "music", "song.mp3"), name: "song.mp3" };
    const data = reconcileMediaForLiveWedding(
      WEDDING_ID,
      { music: { role: "music", url: draftUrl("music", "song.mp3"), name: "song.mp3" } },
      { music: published }
    );

    expect(data.music).toEqual(published);
  });
});

describe("weddingColumnsFromData", () => {
  it("mirrors names and dates without allowing an empty autosave to blank them", () => {
    expect(
      weddingColumnsFromData({
        brideName: "Meera",
        groomName: "Aarav",
        weddingDate: "2027-02-14",
        weddingTime: "19:00",
        venue: "Palace Gardens",
        address: "",
        mapsUrl: "",
      })
    ).toEqual({
      bride_name: "Meera",
      groom_name: "Aarav",
      wedding_date: "2027-02-14",
      wedding_time: "19:00",
      venue: "Palace Gardens",
      address: null,
      maps_url: null,
    });

    expect(weddingColumnsFromData({ brideName: "  ", groomName: "" })).toEqual({});
  });

  it("mirrors the optional RSVP switch onto the wedding column", () => {
    expect(weddingColumnsFromData({ rsvpEnabled: false })).toEqual({ rsvp_toggle: false });
    expect(weddingColumnsFromData({ rsvpEnabled: true })).toEqual({ rsvp_toggle: true });
    expect(weddingColumnsFromData({})).toEqual({});
  });
});
