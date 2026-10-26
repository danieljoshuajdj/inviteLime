import { describe, expect, it } from "vitest";

import { defaultWeddingData } from "@/lib/builder/defaults";
import type { DemoDetailPack } from "@/lib/library-media";
import {
  DEMO_WEDDING_DATA,
  demoDetailsToRuntimeExtras,
  demoDetailsToWeddingData,
  weddingDataToRuntimeInput,
  withDemoMusic,
  withPackMedia,
} from "@/lib/services/demo-wedding";

describe("DEMO_WEDDING_DATA", () => {
  it("is sample content and identifies no real customer", () => {
    expect(DEMO_WEDDING_DATA.brideName).toBe("Bride");
    expect(DEMO_WEDDING_DATA.groomName).toBe("Groom");
    expect(JSON.stringify(DEMO_WEDDING_DATA)).not.toContain("@");
  });
});

describe("weddingDataToRuntimeInput", () => {
  it("maps builder data into the runtime contract", () => {
    const input = weddingDataToRuntimeInput(
      { id: "wed-1", slug: "aarav-weds-meera-2027" },
      defaultWeddingData({
        brideName: "Meera",
        groomName: "Aarav",
        weddingDate: "2027-02-14",
        weddingTime: "19:00",
        venue: "Palace Gardens",
        events: [{ name: "Mehendi", date: "2027-02-12" }],
        gallery: [{ role: "gallery", url: "https://cdn.example/1.jpg", name: "1.jpg" }],
        couplePhoto: "https://cdn.example/couple.jpg",
        music: { role: "music", url: "https://cdn.example/song.mp3", name: "song.mp3" },
        brideDesignation: "Product designer",
        groomDesignation: "Software engineer",
        dress: {
          enabled: true,
          bride: { color: "#c2647a", colorName: "Rosewood" },
          groom: { color: "#1f3d3a", colorName: "Deep teal" },
        },
      })
    );

    expect(input.id).toBe("wed-1");
    expect(input.brideName).toBe("Meera");
    expect(input.brideDesignation).toBe("Product designer");
    expect(input.groomDesignation).toBe("Software engineer");
    expect(input.dress).toEqual({
      bride: { color: "#c2647a", colorName: "Rosewood" },
      groom: { color: "#1f3d3a", colorName: "Deep teal" },
    });
    expect(input.events).toEqual([
      {
        name: "Mehendi",
        date: "2027-02-12",
        time: null,
        venue: null,
        address: null,
        mapsUrl: null,
        description: null,
      },
    ]);
    expect(input.gallery).toEqual([{ url: "https://cdn.example/1.jpg", name: "1.jpg" }]);
    expect(input.photos.couple).toBe("https://cdn.example/couple.jpg");
    expect(input.music?.url).toBe("https://cdn.example/song.mp3");
  });

  it("falls back to stored wedding columns when builder data is empty", () => {
    const input = weddingDataToRuntimeInput(
      {
        id: "wed-2",
        slug: "slug-2",
        date: "2027-03-01",
        venue: "Stored Venue",
        address: "Stored Address",
        mapsUrl: "https://maps.example/x",
      },
      defaultWeddingData()
    );

    expect(input.date).toBe("2027-03-01");
    expect(input.venue).toBe("Stored Venue");
    expect(input.address).toBe("Stored Address");
    expect(input.mapsUrl).toBe("https://maps.example/x");
    expect(input.music).toBeNull();
  });

  it("omits a disabled or invalid dress code from the template payload", () => {
    const disabled = weddingDataToRuntimeInput(
      { id: "wed-3", slug: "slug-3" },
      defaultWeddingData({
        dress: {
          enabled: false,
          bride: { color: "#c2647a", colorName: "Rosewood" },
          groom: { color: "#1f3d3a", colorName: "Deep teal" },
        },
      })
    );
    expect(disabled.dress).toBeNull();

    const invalid = weddingDataToRuntimeInput(
      { id: "wed-4", slug: "slug-4" },
      defaultWeddingData({
        dress: {
          enabled: true,
          bride: { color: "red", colorName: "Not a hex colour" },
          groom: { color: "#1f3d3a", colorName: "Deep teal" },
        },
      })
    );
    expect(invalid.dress).toEqual({
      bride: { color: null, colorName: "Not a hex colour" },
      groom: { color: "#1f3d3a", colorName: "Deep teal" },
    });
  });
});

const detailPack: DemoDetailPack = {
  id: "pack-1",
  name: "Royal Tamil wedding",
  description: null,
  brideName: "Karthika M.",
  groomName: "Jeya Chandran S.",
  brideDesignation: "Daughter of Mr. Mariappan",
  groomDesignation: null,
  brideBio: "Bride bio",
  groomBio: null,
  coupleBio: null,
  story: "Their story",
  weddingDate: "2027-02-14",
  weddingTime: "19:00",
  venue: "The Leela Palace",
  address: "Adyar, Chennai",
  mapsUrl: "https://maps.example/x",
  latitude: 13.08,
  longitude: 80.27,
  dressBrideColor: "#c2647a",
  dressBrideColorName: "Rosewood",
  dressGroomColor: null,
  dressGroomColorName: null,
  rsvpDeadline: "2027-02-01",
  rsvpContactName: "Anand",
  rsvpContactPhone: "+91 98765 43210",
  rsvpWhatsapp: "https://wa.me/919876543210",
  events: [
    {
      id: "e1",
      name: "Mehendi",
      date: "2027-02-12",
      time: "16:00",
      venue: "Courtyard",
      address: null,
      mapsUrl: null,
      description: null,
      sortOrder: 0,
    },
  ],
  templateCount: 1,
  createdAt: "2026-01-12T00:00:00.000Z",
  updatedAt: "2026-01-12T00:00:00.000Z",
};

describe("demoDetailsToWeddingData", () => {
  it("maps an admin details pack into builder data", () => {
    const data = demoDetailsToWeddingData(detailPack);

    expect(data.brideName).toBe("Karthika M.");
    expect(data.groomName).toBe("Jeya Chandran S.");
    expect(data.brideBio).toBe("Bride bio");
    expect(data.story).toBe("Their story");
    expect(data.weddingDate).toBe("2027-02-14");
    expect(data.weddingTime).toBe("19:00");
    expect(data.venue).toBe("The Leela Palace");
    expect(data.address).toBe("Adyar, Chennai");
    expect(data.latitude).toBe(13.08);
    expect(data.events).toEqual([
      {
        name: "Mehendi",
        date: "2027-02-12",
        time: "16:00",
        venue: "Courtyard",
        address: null,
        mapsUrl: null,
        description: null,
      },
    ]);
    expect(data.bridePhoto).toBeNull();
    expect(data.music).toBeNull();
  });

  it("leaves optional text empty rather than inventing copy", () => {
    const data = demoDetailsToWeddingData({
      ...detailPack,
      groomBio: null,
      coupleBio: null,
      story: null,
    });

    expect(data.groomBio).toBe("");
    expect(data.coupleBio).toBe("");
    expect(data.story).toBe("");
  });
});

describe("demoDetailsToRuntimeExtras", () => {
  it("maps designations and dress-code swatches", () => {
    expect(demoDetailsToRuntimeExtras(detailPack)).toEqual({
      brideDesignation: "Daughter of Mr. Mariappan",
      groomDesignation: null,
      dress: {
        bride: { color: "#c2647a", colorName: "Rosewood" },
        groom: { color: null, colorName: null },
      },
    });
  });

  it("returns a null dress code when the pack defines no colours", () => {
    const extras = demoDetailsToRuntimeExtras({
      ...detailPack,
      dressBrideColor: null,
      dressBrideColorName: null,
      dressGroomColor: null,
      dressGroomColorName: null,
    });

    expect(extras.dress).toBeNull();
  });
});

describe("withDemoMusic", () => {
  it("sets the assigned song on the demo dataset", () => {
    const data = withDemoMusic(DEMO_WEDDING_DATA, {
      id: "track-1",
      title: "Golden Hour",
      artist: "Studio",
      url: "/api/music/library/track.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
      durationMs: 1000,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(data.music).toEqual({
      role: "music",
      url: "/api/music/library/track.mp3",
      name: "Golden Hour — Studio",
    });
  });
});

describe("withPackMedia", () => {
  const packMedia = {
    photos: {
      bride: "/api/media/library/media/photo-bride.webp",
      groom: "/api/media/library/media/photo-groom.webp",
      couple: "/api/media/library/media/photo-couple.webp",
    },
    gallery: [{ url: "/api/media/library/media/photo-1.webp" }],
  };

  it("fills the demo's photo slots and gallery from the pack", () => {
    const data = withPackMedia(DEMO_WEDDING_DATA, packMedia);
    expect(data.bridePhoto).toBe("/api/media/library/media/photo-bride.webp");
    expect(data.groomPhoto).toBe("/api/media/library/media/photo-groom.webp");
    expect(data.couplePhoto).toBe("/api/media/library/media/photo-couple.webp");
    expect(data.gallery).toEqual([
      { role: "gallery", url: "/api/media/library/media/photo-1.webp" },
    ]);

    const runtime = weddingDataToRuntimeInput({ id: "demo", slug: "demo" }, data);
    expect(runtime.photos.bride).toBe("/api/media/library/media/photo-bride.webp");
    expect(runtime.gallery).toEqual([
      { url: "/api/media/library/media/photo-1.webp", name: undefined },
    ]);
  });

  it("keeps stock copy — a pack never impersonates a real couple", () => {
    const data = withPackMedia(DEMO_WEDDING_DATA, packMedia);
    expect(data.brideName).toBe(DEMO_WEDDING_DATA.brideName);
    expect(data.groomName).toBe(DEMO_WEDDING_DATA.groomName);
    expect(data.story).toBe(DEMO_WEDDING_DATA.story);
  });

  it("falls back to existing photos for slots the pack leaves empty", () => {
    const data = withPackMedia(
      defaultWeddingData({
        couplePhoto: "/api/media/wed-1/couple/couple.webp",
        gallery: [{ role: "gallery", url: "/api/media/wed-1/gallery/1.webp" }],
      }),
      {
        photos: { bride: "/api/media/library/media/photo-bride.webp", groom: null, couple: null },
        gallery: [],
      }
    );

    expect(data.bridePhoto).toBe("/api/media/library/media/photo-bride.webp");
    expect(data.groomPhoto).toBeNull();
    expect(data.couplePhoto).toBe("/api/media/wed-1/couple/couple.webp");
    expect(data.gallery).toEqual([{ role: "gallery", url: "/api/media/wed-1/gallery/1.webp" }]);
  });
});
