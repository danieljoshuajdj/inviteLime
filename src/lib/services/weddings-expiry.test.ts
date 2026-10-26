import { describe, expect, it } from "vitest";

import { isWeddingExpired } from "./weddings";

/**
 * `is_wedding_public()` in the migrations requires
 * `expiration_date >= current_date`, and these cases pin the app-side helper to
 * that same inclusive-day rule. The two drifting apart is what previously let
 * the app 404 an invitation the database still considered public.
 */
describe("isWeddingExpired", () => {
  const now = new Date("2026-02-14T18:30:00.000Z");

  it("treats the expiration date as inclusive", () => {
    expect(isWeddingExpired("2026-02-14", now)).toBe(false);
  });

  it("expires from the day after the expiration date", () => {
    expect(isWeddingExpired("2026-02-13", now)).toBe(true);
    expect(isWeddingExpired("2026-02-01", now)).toBe(true);
  });

  it("never expires a wedding with no expiration date", () => {
    expect(isWeddingExpired(null, now)).toBe(false);
    expect(isWeddingExpired("", now)).toBe(false);
  });

  it("is not fooled by the time of day on the final day", () => {
    // The old check was `new Date(date) < Date.now()`, which expired a
    // subscription at 00:00 on its own last day.
    const startOfFinalDay = new Date("2026-02-14T00:00:01.000Z");
    expect(isWeddingExpired("2026-02-14", startOfFinalDay)).toBe(false);
    expect(isWeddingExpired("2026-02-14T23:59:59.000Z", startOfFinalDay)).toBe(false);
  });

  it("ignores a timestamp component if one is ever returned", () => {
    expect(isWeddingExpired("2026-02-14T00:00:00.000Z", now)).toBe(false);
    expect(isWeddingExpired("2026-02-13T23:59:59.000Z", now)).toBe(true);
  });

  it("crosses a year boundary correctly", () => {
    expect(isWeddingExpired("2025-12-31", new Date("2026-01-01T09:00:00.000Z"))).toBe(true);
    expect(isWeddingExpired("2026-12-31", new Date("2026-01-01T09:00:00.000Z"))).toBe(false);
  });
});
