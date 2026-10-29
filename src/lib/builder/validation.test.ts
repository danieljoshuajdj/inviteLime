import { describe, expect, it } from "vitest";

import { defaultWeddingData } from "./defaults";
import {
  BIRTHDAY_NUMBER_MAX,
  BIRTHDAY_NUMBER_MIN,
  detailsComplete,
  isPastEventMoment,
  isValidBirthdayNumber,
  validateDetails,
} from "./validation";

const NOW = new Date("2026-06-01T12:00:00");

function wedding(overrides: Parameters<typeof defaultWeddingData>[0] = {}) {
  return defaultWeddingData({
    brideName: "Meera",
    groomName: "Aarav",
    weddingDate: "2027-02-14",
    venue: "The Grand Palace",
    ...overrides,
  });
}

function celebration(overrides: Parameters<typeof defaultWeddingData>[0] = {}) {
  return defaultWeddingData({
    formType: "birthday_celebration",
    celebrantName: "Ananya",
    weddingDate: "2027-02-14",
    venue: "The Grand Palace",
    ...overrides,
  });
}

function wishes(overrides: Parameters<typeof defaultWeddingData>[0] = {}) {
  return defaultWeddingData({
    formType: "birthday_wishes",
    celebrantName: "Ananya",
    birthdayNumber: 21,
    specialMessage: "Wishing you the happiest year yet.",
    ...overrides,
  });
}

describe("isValidBirthdayNumber", () => {
  it("accepts whole numbers in range", () => {
    expect(isValidBirthdayNumber(BIRTHDAY_NUMBER_MIN)).toBe(true);
    expect(isValidBirthdayNumber(21)).toBe(true);
    expect(isValidBirthdayNumber(BIRTHDAY_NUMBER_MAX)).toBe(true);
  });

  it("rejects fractions, strings and values outside the range", () => {
    expect(isValidBirthdayNumber(0)).toBe(false);
    expect(isValidBirthdayNumber(151)).toBe(false);
    expect(isValidBirthdayNumber(21.5)).toBe(false);
    expect(isValidBirthdayNumber("21")).toBe(false);
    expect(isValidBirthdayNumber(null)).toBe(false);
  });
});

describe("validateDetails", () => {
  it("requires both names, a date and a venue for a wedding", () => {
    expect(validateDetails(wedding(), "wedding")).toBeNull();
    expect(validateDetails(wedding({ brideName: "" }), "wedding")?.sectionId).toBe(
      "couple-details"
    );
    expect(validateDetails(wedding({ groomName: "" }), "wedding")?.sectionId).toBe(
      "couple-details"
    );
    expect(validateDetails(wedding({ weddingDate: "" }), "wedding")?.sectionId).toBe(
      "when-and-where"
    );
    expect(validateDetails(wedding({ venue: "  " }), "wedding")?.sectionId).toBe(
      "when-and-where"
    );
  });

  it("uses the engagement date wording for an engagement", () => {
    const issue = validateDetails(wedding({ weddingDate: "" }), "engagement");
    expect(issue?.message).toContain("Engagement date");
  });

  it("requires only the celebrant, date and venue for a birthday celebration", () => {
    expect(validateDetails(celebration(), "birthday_celebration")).toBeNull();
    expect(detailsComplete(celebration(), "birthday_celebration")).toBe(true);
    expect(
      validateDetails(celebration({ celebrantName: "  " }), "birthday_celebration")?.sectionId
    ).toBe("celebrant-details");
    expect(
      validateDetails(celebration({ weddingDate: "" }), "birthday_celebration")?.sectionId
    ).toBe("when-and-where");
  });

  it("requires the birthday number and message for birthday wishes", () => {
    expect(validateDetails(wishes(), "birthday_wishes")).toBeNull();
    expect(detailsComplete(wishes(), "birthday_wishes")).toBe(true);

    expect(
      validateDetails(wishes({ birthdayNumber: null }), "birthday_wishes")?.sectionId
    ).toBe("celebrant-details");
    expect(
      validateDetails(wishes({ birthdayNumber: 0 }), "birthday_wishes")?.message
    ).toContain("between 1 and 150");
    expect(
      validateDetails(wishes({ specialMessage: "  " }), "birthday_wishes")?.sectionId
    ).toBe("celebrant-details");
  });

  it("does not require an event date or venue for birthday wishes", () => {
    expect(
      validateDetails(wishes({ weddingDate: "", venue: "" }), "birthday_wishes")
    ).toBeNull();
    expect(detailsComplete(wishes({ weddingDate: "", venue: "" }), "birthday_wishes")).toBe(
      true
    );
  });

  it("caps the birthday-wishes gallery at three photos", () => {
    const gallery = Array.from({ length: 4 }, (_, i) => ({
      role: "gallery" as const,
      url: `/media/${i}.jpg`,
    }));
    expect(validateDetails(wishes({ gallery }), "birthday_wishes")?.sectionId).toBe(
      "photos"
    );
    expect(
      validateDetails(wishes({ gallery: gallery.slice(0, 3) }), "birthday_wishes")
    ).toBeNull();
  });

  it("only rejects past dates when the caller supplies a clock", () => {
    const past = wedding({ weddingDate: "2026-01-01", weddingTime: null });
    expect(validateDetails(past, "wedding", NOW)?.message).toContain("already passed");
    // Account edits pass null so a live invitation whose date has passed stays editable.
    expect(validateDetails(past, "wedding", null)).toBeNull();

    const pastCelebration = celebration({ weddingDate: "2026-01-01" });
    expect(
      validateDetails(pastCelebration, "birthday_celebration", NOW)?.message
    ).toContain("celebration");
  });

  it("rejects a past additional ceremony for wedding/engagement only", () => {
    const staleEvent = {
      name: "Sangeet",
      date: "2026-01-01",
      time: null,
    };
    expect(
      validateDetails(wedding({ events: [staleEvent] }), "wedding", NOW)?.message
    ).toContain("Sangeet");
    expect(
      validateDetails(wedding({ events: [staleEvent] }), "wedding", null)
    ).toBeNull();
  });

  it("does not un-tick a complete form because its date has passed", () => {
    expect(detailsComplete(wedding({ weddingDate: "2020-01-01" }), "wedding")).toBe(true);
  });
});

describe("isPastEventMoment", () => {
  it("treats a date without a time as the end of that day", () => {
    expect(isPastEventMoment("2026-06-01", null, NOW)).toBe(false);
    expect(isPastEventMoment("2026-05-31", null, NOW)).toBe(true);
    expect(isPastEventMoment("2026-06-01", "10:00", NOW)).toBe(true);
    expect(isPastEventMoment("2026-06-01", "13:00", NOW)).toBe(false);
  });

  it("ignores an unparseable date", () => {
    expect(isPastEventMoment("not-a-date", null, NOW)).toBe(false);
  });
});
