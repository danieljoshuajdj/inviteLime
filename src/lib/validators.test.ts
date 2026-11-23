import { describe, expect, it } from "vitest";

import {
  rsvpSchema,
  slugSchema,
  weddingDataSchema,
  weddingDraftSchema,
  isReservedSlug,
} from "@/lib/validators";

describe("weddingDataSchema", () => {
  it("accepts a minimal valid draft and applies defaults", () => {
    const parsed = weddingDataSchema.safeParse({
      brideName: "Meera",
      groomName: "Aarav",
      weddingDate: "2027-02-14",
      venue: "Palace Gardens",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.events).toEqual([]);
    expect(parsed.data.address).toBe("");
    expect(parsed.data.rsvpEnabled).toBe(false);
    expect(parsed.data.brideDesignation).toBe("");
    expect(parsed.data.rsvpWhatsapp).toBe("");
  });

  it("accepts optional designations and a dress-code choice", () => {
    const parsed = weddingDataSchema.safeParse({
      brideName: "Meera",
      groomName: "Aarav",
      weddingDate: "2027-02-14",
      venue: "Palace Gardens",
      brideDesignation: "Product designer",
      groomDesignation: "Software engineer",
      dress: {
        enabled: true,
        bride: { color: "#c2647a", colorName: "Rosewood" },
        groom: { color: "#1f3d3a", colorName: "Deep teal" },
      },
      rsvpEnabled: false,
      rsvpWhatsapp: "+91 98765 43210",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.dress?.enabled).toBe(true);
    expect(parsed.data.rsvpEnabled).toBe(false);
    expect(parsed.data.rsvpWhatsapp).toBe("+91 98765 43210");
  });

  it("rejects an invalid RSVP WhatsApp number at publish time but lets drafts autosave it", () => {
    const base = {
      brideName: "Meera",
      groomName: "Aarav",
      weddingDate: "2027-02-14",
      venue: "Palace Gardens",
    };
    expect(weddingDataSchema.safeParse({ ...base, rsvpWhatsapp: "123" }).success).toBe(false);
    expect(weddingDraftSchema.safeParse({ rsvpWhatsapp: "123" }).success).toBe(true);
  });

  it("rejects missing names and venues", () => {
    const parsed = weddingDataSchema.safeParse({
      brideName: "",
      groomName: "",
      weddingDate: "",
      venue: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects more than 12 ceremony cards", () => {
    const parsed = weddingDataSchema.safeParse({
      brideName: "Meera",
      groomName: "Aarav",
      weddingDate: "2027-02-14",
      venue: "Palace Gardens",
      events: Array.from({ length: 13 }, (_, i) => ({ name: `Event ${i}` })),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("weddingDraftSchema", () => {
  it("accepts work-in-progress the strict publish schema rejects", () => {
    const inProgress = {
      brideName: "Meera",
      groomName: "",
      events: [{ name: "" }, { name: "Mehendi & Haldi", date: "2027-02-12" }],
      mapsUrl: "https://maps.app.goo.gl/",
    };
    expect(weddingDraftSchema.safeParse(inProgress).success).toBe(true);
    expect(weddingDataSchema.safeParse(inProgress).success).toBe(false);
  });

  it("accepts a half-configured dress-code card while the builder is editing", () => {
    expect(
      weddingDraftSchema.safeParse({
        dress: { enabled: true, bride: { color: "#c26" } },
        rsvpEnabled: false,
      }).success
    ).toBe(true);
  });

  it("keeps birthday fields through autosave", () => {
    const parsed = weddingDraftSchema.safeParse({
      formType: "birthday_wishes",
      celebrantName: "Ananya",
      birthdayNumber: 21,
      specialMessage: "Happy birthday!",
      mainPhoto: "/media/main.jpg",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.formType).toBe("birthday_wishes");
    expect(parsed.data.celebrantName).toBe("Ananya");
    expect(parsed.data.birthdayNumber).toBe(21);
    expect(parsed.data.specialMessage).toBe("Happy birthday!");
    expect(parsed.data.mainPhoto).toBe("/media/main.jpg");
  });

  it("still bounds lengths and collection sizes", () => {
    expect(weddingDraftSchema.safeParse({ brideName: "M".repeat(121) }).success).toBe(false);
    expect(
      weddingDraftSchema.safeParse({ events: Array.from({ length: 13 }, () => ({ name: "x" })) }).success
    ).toBe(false);
  });
});

describe("rsvpSchema", () => {
  it("coerces guest counts and normalises an empty email", () => {
    const parsed = rsvpSchema.safeParse({
      weddingId: "11111111-1111-4111-8111-111111111111",
      name: "Guest",
      email: "",
      phone: "+91 98765 43210",
      attendance: "attending",
      guests: "3",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.guests).toBe(3);
    expect(parsed.data.email).toBeNull();
    expect(parsed.data.phone).toBe("+91 98765 43210");
  });

  it("rejects a phone number with too few digits", () => {
    const parsed = rsvpSchema.safeParse({
      weddingId: "11111111-1111-4111-8111-111111111111",
      name: "Guest",
      phone: "123",
      attendance: "attending",
    });
    expect(parsed.success).toBe(false);
  });

  it("treats an empty phone field as no phone", () => {
    const parsed = rsvpSchema.safeParse({
      weddingId: "11111111-1111-4111-8111-111111111111",
      name: "Guest",
      phone: "",
      attendance: "attending",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.phone).toBeNull();
  });

  it("rejects an unknown attendance value", () => {
    const parsed = rsvpSchema.safeParse({
      weddingId: "11111111-1111-4111-8111-111111111111",
      name: "Guest",
      attendance: "maybe",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("slugSchema", () => {
  it("accepts url-safe slugs only", () => {
    expect(slugSchema.safeParse("aarav-weds-meera-2027").success).toBe(true);
    expect(slugSchema.safeParse("Aarav Weds Meera").success).toBe(false);
  });

  it("blocks slugs reserved by platform routes", () => {
    expect(slugSchema.safeParse("admin").success).toBe(false);
    expect(slugSchema.safeParse("_next").success).toBe(false);
    expect(isReservedSlug("TEMPLATES")).toBe(true);
    expect(isReservedSlug("aarav-weds-meera")).toBe(false);
  });
});
