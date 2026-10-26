import { describe, expect, it } from "vitest";

import { categorySlug, matchesSelectedCategories } from "./explore-filter";

describe("explore category filtering", () => {
  it("matches every template when no filter is selected", () => {
    expect(matchesSelectedCategories(["Royal Mughal"], [])).toBe(true);
  });

  it("matches a multi-word category name against its chip slug", () => {
    expect(categorySlug("Royal Mughal")).toBe("royal-mughal");
    expect(matchesSelectedCategories(["Royal Mughal"], ["royal-mughal"])).toBe(true);
  });

  it("matches regardless of the category's casing", () => {
    expect(matchesSelectedCategories(["Traditional"], ["traditional"])).toBe(true);
  });

  it("accepts a template that belongs to any selected category", () => {
    expect(matchesSelectedCategories(["Modern", "Floral"], ["floral", "minimal"])).toBe(true);
  });

  it("rejects templates that do not belong to the selected category", () => {
    expect(matchesSelectedCategories(["Modern"], ["royal-mughal"])).toBe(false);
  });
});
