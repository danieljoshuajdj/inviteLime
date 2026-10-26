import { describe, expect, it } from "vitest";

import {
  addMonths,
  expirationFromWeddingDate,
  formatPrice,
  isPastMoment,
  minSelectable,
  slugify,
  toDateInputValue,
  toTimeInputValue,
  uniqueSlugWithSuffix,
} from "@/lib/utils";

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("Aarav & Meera")).toBe("aarav-meera");
    expect(slugify("Royal Mughal 2.0")).toBe("royal-mughal-2-0");
    expect(slugify("  -- Leading and trailing -- ")).toBe("leading-and-trailing");
  });

  it("falls back for input with no usable characters", () => {
    expect(slugify("###")).toBe("");
  });
});

describe("uniqueSlugWithSuffix", () => {
  it("prefixes the current year", () => {
    const year = new Date().getFullYear();
    expect(uniqueSlugWithSuffix("Aarav & Meera")).toBe(`aarav-meera-${year}`);
    expect(uniqueSlugWithSuffix("Aarav", "retry")).toBe(`aarav-retry-${year}`);
  });
});

describe("expiration window", () => {
  it("adds two calendar months", () => {
    const expiry = expirationFromWeddingDate(new Date(2026, 11, 15));
    expect(expiry.getFullYear()).toBe(2027);
    expect(expiry.getMonth()).toBe(1);
    expect(expiry.getDate()).toBe(15);
  });

  it("clamps month-end overflow to the last valid day", () => {
    const expiry = addMonths(new Date(2026, 11, 31), 2);
    expect(expiry.getFullYear()).toBe(2027);
    expect(expiry.getMonth()).toBe(1);
    expect(expiry.getDate()).toBe(28);
  });
});

describe("formatPrice", () => {
  it("formats paise into major units", () => {
    expect(formatPrice(499900)).toContain("4,999");
    expect(formatPrice(123456)).toContain("1,234.56");
  });
});

describe("date and time input values", () => {
  it("formats local dates and times the way the pickers read them", () => {
    const noon = new Date(2026, 8, 5, 14, 7);
    expect(toDateInputValue(noon)).toBe("2026-09-05");
    expect(toTimeInputValue(noon)).toBe("14:07");
  });

  it("pads single-digit months, days, hours and minutes", () => {
    const justPastMidnight = new Date(2026, 0, 2, 3, 4);
    expect(toDateInputValue(justPastMidnight)).toBe("2026-01-02");
    expect(toTimeInputValue(justPastMidnight)).toBe("03:04");
  });

  it("keeps local calendar days instead of shifting to UTC", () => {
    // 00:30 local on the 1st is still the 1st; toISOString() would say the previous day.
    expect(toDateInputValue(new Date(2026, 5, 1, 0, 30))).toBe("2026-06-01");
    expect(toDateInputValue(new Date(2026, 5, 1, 23, 45))).toBe("2026-06-01");
  });
});

describe("isPastMoment", () => {
  const now = new Date(2026, 8, 10, 15, 30); // 10 Sep 2026, 15:30 local

  it("flags earlier dates and allows later ones", () => {
    expect(isPastMoment("2026-09-09", "23:00", now)).toBe(true);
    expect(isPastMoment("2026-09-11", "09:00", now)).toBe(false);
    expect(isPastMoment("2027-01-01", null, now)).toBe(false);
  });

  it("compares the time only for today", () => {
    expect(isPastMoment("2026-09-10", "15:29", now)).toBe(true);
    expect(isPastMoment("2026-09-10", "15:30", now)).toBe(false);
    expect(isPastMoment("2026-09-10", "15:31", now)).toBe(false);
    // A day-only entry on today ("all day") is never in the past.
    expect(isPastMoment("2026-09-10", null, now)).toBe(false);
    expect(isPastMoment("2026-09-10", "", now)).toBe(false);
  });

  it("treats a missing date as not in the past", () => {
    expect(isPastMoment("", "09:00", now)).toBe(false);
  });
});

describe("minSelectable", () => {
  it("applies the bound to fresh selections", () => {
    expect(minSelectable("2026-09-10", "")).toBe("2026-09-10");
    expect(minSelectable("2026-09-10", undefined)).toBe("2026-09-10");
    expect(minSelectable("2026-09-10", "2026-09-10")).toBe("2026-09-10");
    expect(minSelectable("2026-09-10", "2027-02-14")).toBe("2026-09-10");
  });

  it("steps aside for a value that is already below the bound", () => {
    // A wedding that already happened must stay editable, not unsavable.
    expect(minSelectable("2026-09-10", "2025-12-31")).toBeUndefined();
    expect(minSelectable("15:30", "09:00")).toBeUndefined();
  });

  it("has no bound before the client clock is known", () => {
    expect(minSelectable(undefined, "2025-12-31")).toBeUndefined();
    expect(minSelectable(null, "")).toBeUndefined();
  });
});
