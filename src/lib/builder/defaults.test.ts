import { describe, expect, it } from "vitest";

import {
  DEFAULT_DRESS_COLORS,
  defaultWeddingData,
  normalizeWeddingData,
  validDressColor,
  weddingDataForDb,
} from "./defaults";

describe("builder guest settings", () => {
  it("defaults RSVP to off and leaves the optional fields empty", () => {
    const data = defaultWeddingData();
    expect(normalizeWeddingData({}).rsvpEnabled).toBe(false);
    expect(data.rsvpEnabled).toBe(false);
    expect(data.rsvpWhatsapp).toBe("");
    expect(data.brideDesignation).toBe("");
    expect(data.groomDesignation).toBe("");
    expect(data.dress).toBeNull();
  });

  it("normalizes a partial or invalid dress object without leaking bad colours", () => {
    const data = normalizeWeddingData({
      dress: {
        enabled: true,
        bride: { color: "#c26", colorName: "  Rosewood  " },
      },
      rsvpEnabled: false,
    });

    expect(data.dress).toEqual({
      enabled: true,
      bride: { color: null, colorName: "Rosewood" },
      groom: { color: null, colorName: "" },
    });
    expect(data.rsvpEnabled).toBe(false);
  });

  it("only accepts full six-digit hex colours", () => {
    expect(validDressColor("#c2647a")).toBe("#c2647a");
    expect(validDressColor("#C2647A")).toBe("#C2647A");
    expect(validDressColor("#c26")).toBeNull();
    expect(validDressColor("rosewood")).toBeNull();
    expect(validDressColor(null)).toBeNull();
  });

  it("sanitizes dress data before saving and keeps an explicit RSVP off", () => {
    const saved = weddingDataForDb(
      defaultWeddingData({
        groomDesignation: "  ",
        rsvpWhatsapp: "  +91 98765 43210  ",
        dress: {
          enabled: true,
          bride: { color: "not-a-colour", colorName: " Rosewood " },
          groom: { color: DEFAULT_DRESS_COLORS.groom, colorName: "Deep teal" },
        },
        rsvpEnabled: false,
      })
    );

    expect(saved.groomDesignation).toBe("");
    expect(saved.rsvpWhatsapp).toBe("+91 98765 43210");
    expect(saved.rsvpEnabled).toBe(false);
    expect(saved.dress).toEqual({
      enabled: true,
      bride: { color: null, colorName: "Rosewood" },
      groom: { color: DEFAULT_DRESS_COLORS.groom, colorName: "Deep teal" },
    });
  });
});

describe("event form fields", () => {
  it("defaults legacy data to the wedding form", () => {
    const data = normalizeWeddingData({});
    expect(data.formType).toBe("wedding");
    expect(data.celebrantName).toBe("");
    expect(data.birthdayNumber).toBeNull();
    expect(data.specialMessage).toBe("");
    expect(data.mainPhoto).toBeNull();
  });

  it("normalizes birthday fields from stored JSON", () => {
    const data = normalizeWeddingData({
      formType: "birthday_wishes",
      celebrantName: "  Ananya  ",
      birthdayNumber: "21",
      specialMessage: "  Happy birthday!  ",
      mainPhoto: "/media/main.jpg",
    });

    expect(data.formType).toBe("birthday_wishes");
    expect(data.celebrantName).toBe("  Ananya  ");
    expect(data.birthdayNumber).toBe(21);
    expect(data.specialMessage).toBe("  Happy birthday!  ");
    expect(data.mainPhoto).toBe("/media/main.jpg");
  });

  it("rejects unknown form types and non-numeric birthdays", () => {
    const data = normalizeWeddingData({
      formType: "anniversary",
      birthdayNumber: "not-a-number",
    });
    expect(data.formType).toBe("wedding");
    expect(data.birthdayNumber).toBeNull();
  });

  it("keeps explicit clears and the derived form type when saving", () => {
    const saved = weddingDataForDb(
      defaultWeddingData({
        formType: "birthday_wishes",
        celebrantName: "",
        specialMessage: "",
        mainPhoto: null,
        birthdayNumber: null,
      })
    );

    expect(saved.formType).toBe("birthday_wishes");
    expect(saved.celebrantName).toBe("");
    expect(saved.specialMessage).toBe("");
    expect(saved.mainPhoto).toBeNull();
    expect(saved.birthdayNumber).toBeNull();
  });

  it("does not persist non-numeric birthday values", () => {
    const saved = weddingDataForDb(
      defaultWeddingData({
        birthdayNumber: "21" as unknown as number,
      })
    );
    expect(saved.birthdayNumber).toBeUndefined();
  });
});
