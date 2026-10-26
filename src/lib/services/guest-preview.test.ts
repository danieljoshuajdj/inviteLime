import { describe, expect, it } from "vitest";

import { buildGuestPreviewPayload } from "@/lib/services/guest-preview";

const context = {
  draftId: "11111111-1111-4111-8111-111111111111",
  templateSlug: "royal-mughal",
  token: "abc123def456token",
  appUrl: "https://app.example.com",
};

describe("buildGuestPreviewPayload", () => {
  it("maps builder data onto the runtime contract", () => {
    const payload = buildGuestPreviewPayload(context, {
      brideName: "Meera",
      groomName: "Aarav",
      brideBio: "The bride",
      groomBio: "The groom",
      coupleBio: "Two of us",
      story: "Once upon a time",
      weddingDate: "2027-02-14",
      weddingTime: "19:00",
      venue: "Palace Gardens",
      address: "12 Lake Road",
      mapsUrl: "https://maps.example.com/",
      events: [{ name: "Mehendi", date: "2027-02-12", venue: "Courtyard" }],
      gallery: [{ role: "gallery", url: "https://cdn.example.com/a.jpg", name: "a.jpg" }],
      bridePhoto: "https://cdn.example.com/bride.jpg",
      couplePhoto: "https://cdn.example.com/couple.jpg",
      music: { role: "music", url: "https://cdn.example.com/song.mp3", name: "song.mp3" },
      rsvpEnabled: true,
      rsvpWhatsapp: "+91 98765 43210",
    });

    expect(payload.runtime).toBe("invite-lime");
    expect(payload.mode).toBe("live");
    expect(payload.wedding).toMatchObject({
      id: context.draftId,
      slug: context.templateSlug,
      brideName: "Meera",
      groomName: "Aarav",
      date: "2027-02-14",
      time: "19:00",
      venue: "Palace Gardens",
      events: [{ name: "Mehendi", date: "2027-02-12", venue: "Courtyard" }],
      gallery: [{ url: "https://cdn.example.com/a.jpg", name: "a.jpg" }],
      photos: { bride: "https://cdn.example.com/bride.jpg", groom: null, couple: "https://cdn.example.com/couple.jpg" },
      music: { url: "https://cdn.example.com/song.mp3", name: "song.mp3" },
    });
    expect(payload.invitation.url).toBe(`${context.appUrl}/create/${context.token}`);
    expect(payload.rsvp.enabled).toBe(true);
    expect(payload.rsvp.preview).toBe(true);
    expect(payload.rsvp.whatsappNumber).toBe("919876543210");
    expect(payload.assets.baseUrl).toBe(`${context.appUrl}/`);
  });

  it("carries planner branding only when the preview context supplies it", () => {
    const branded = buildGuestPreviewPayload(
      {
        ...context,
        planner: {
          brandName: "Rose & Ink",
          contactPhone: "+91 98765 43210",
          address: null,
          mapsUrl: "https://maps.google.com/?q=Rose+Ink",
        },
      },
      { brideName: "Meera" }
    );
    expect(branded.planner).toEqual({
      brandName: "Rose & Ink",
      contactPhone: "+91 98765 43210",
      address: null,
      mapsUrl: "https://maps.google.com/?q=Rose+Ink",
    });

    expect(buildGuestPreviewPayload(context, { brideName: "Meera" }).planner).toBeNull();
  });

  it("tolerates a partial/empty preview so mid-edit renders are safe", () => {
    const payload = buildGuestPreviewPayload(context, { brideName: "Meera" });
    expect(payload.wedding.brideName).toBe("Meera");
    expect(payload.wedding.groomName).toBe("");
    expect(payload.wedding.events).toEqual([]);
    expect(payload.wedding.gallery).toEqual([]);
  });
});