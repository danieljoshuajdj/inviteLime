import { describe, expect, it } from "vitest";

import {
  EVENT_CATEGORIES,
  FORM_TYPES,
  categorySlugForFormType,
  coverTitle,
  firstName,
  formDefinition,
  formSubtitle,
  formTypeFromCategorySlug,
  formTypeOf,
  formTypeOrDefault,
  hasEventDate,
  isBirthdayForm,
  isFormType,
  ordinal,
} from "./forms";

describe("ordinal", () => {
  it("adds the right suffix for ordinary numbers", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
    expect(ordinal(101)).toBe("101st");
  });

  it("treats the teens as exceptions", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(111)).toBe("111th");
    expect(ordinal(112)).toBe("112th");
  });

  it("does not invent a suffix for non-positive or fractional values", () => {
    expect(ordinal(0)).toBe("0");
    expect(ordinal(-3)).toBe("-3");
    expect(ordinal(1.5)).toBe("1.5");
    expect(ordinal(Number.NaN)).toBe("NaN");
  });
});

describe("form type registry", () => {
  it("lists the four supported forms", () => {
    expect(FORM_TYPES).toEqual([
      "wedding",
      "engagement",
      "birthday_celebration",
      "birthday_wishes",
    ]);
  });

  it("maps each form to exactly one category", () => {
    expect(EVENT_CATEGORIES.map((c) => c.slug)).toEqual([
      "wedding",
      "engagement",
      "birthday-celebration",
      "birthday-wishes",
    ]);
    expect(formTypeFromCategorySlug("birthday-celebration")).toBe("birthday_celebration");
    expect(formTypeFromCategorySlug("birthday-wishes")).toBe("birthday_wishes");
    expect(formTypeFromCategorySlug("style")).toBeNull();
    expect(formTypeFromCategorySlug(null)).toBeNull();
    expect(categorySlugForFormType("engagement")).toBe("engagement");
  });

  it("only accepts known form identifiers", () => {
    expect(isFormType("engagement")).toBe(true);
    expect(isFormType("birthday_celebration")).toBe(true);
    expect(isFormType("wedding")).toBe(true);
    expect(isFormType("birthday")).toBe(false);
    expect(isFormType(undefined)).toBe(false);
  });

  it("falls back to the wedding form for legacy drafts", () => {
    expect(formTypeOrDefault(undefined)).toBe("wedding");
    expect(formTypeOrDefault("something-else")).toBe("wedding");
    expect(formTypeOf({})).toBe("wedding");
    expect(formTypeOf(null)).toBe("wedding");
    expect(formTypeOf({ formType: "engagement" })).toBe("engagement");
  });
});

describe("form display helpers", () => {
  it("uses the celebrant for birthday forms", () => {
    expect(
      coverTitle({
        formType: "birthday_wishes",
        celebrantName: "  Ananya  ",
        brideName: "Meera",
        groomName: "Aarav",
      })
    ).toBe("Ananya");
    expect(coverTitle({ formType: "birthday_celebration", celebrantName: "" })).toBe(
      "Name here"
    );
  });

  it("uses first names for the couple", () => {
    expect(coverTitle({ brideName: "Meera Kapoor", groomName: "Aarav Shah" })).toBe(
      "Aarav & Meera"
    );
    expect(coverTitle({ brideName: "Meera", groomName: "" })).toBe("Meera");
    expect(coverTitle({})).toBe("Your names here");
    expect(firstName("  Aarav Shah ")).toBe("Aarav");
  });

  it("shows the ordinal subtitle only for wishes", () => {
    expect(formSubtitle({ formType: "birthday_wishes", birthdayNumber: 21 })).toBe(
      "21st Birthday"
    );
    expect(formSubtitle({ formType: "birthday_wishes", birthdayNumber: null })).toBe(
      "Birthday Wishes"
    );
    expect(formSubtitle({ formType: "birthday_celebration", birthdayNumber: 21 })).toBeNull();
    expect(formSubtitle({ formType: "wedding" })).toBeNull();
  });

  it("labels each form and says whether it has an event date", () => {
    expect(formDefinition("engagement").dateLabel).toBe("Engagement date");
    expect(formDefinition("birthday_wishes").dateLabel).toBe("");
    expect(hasEventDate("birthday_wishes")).toBe(false);
    expect(hasEventDate("birthday_celebration")).toBe(true);
    expect(hasEventDate("wedding")).toBe(true);
    expect(isBirthdayForm("birthday_celebration")).toBe(true);
    expect(isBirthdayForm("engagement")).toBe(false);
  });
});
