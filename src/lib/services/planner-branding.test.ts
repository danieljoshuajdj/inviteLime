import { describe, expect, it } from "vitest";

import {
  brandSnapshot,
  isPlannerBrandComplete,
  isSafeExternalUrl,
  normalizeMapsUrl,
  normalizePhoneForTel,
  readBrandSnapshot,
  resolveInvitationPlannerBrand,
  snapshotToJson,
} from "@/lib/services/planner-branding";

const brand = {
  profileId: "planner-1",
  brandName: "  Rose & Ink Studio  ",
  contactPhone: " +91 98765 43210 ",
  address: "  12 Palace Road  ",
  mapsUrl: "https://maps.google.com/?q=Rose+Ink",
  updatedAt: null,
};

describe("planner branding", () => {
  it("normalises tel: numbers", () => {
    expect(normalizePhoneForTel(" +91 (98765) 43210 ")).toBe("+919876543210");
    expect(normalizePhoneForTel("98765-43210")).toBe("9876543210");
  });

  it("accepts only http(s) external URLs", () => {
    expect(isSafeExternalUrl("https://maps.google.com")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("tel:+919876543210")).toBe(false);
    expect(normalizeMapsUrl(" javascript:alert(1) ")).toBeNull();
    expect(normalizeMapsUrl("  https://maps.google.com  ")).toBe("https://maps.google.com");
  });

  it("captures a trimmed, immutable snapshot at publish time", () => {
    const snapshot = brandSnapshot(brand, new Date("2026-10-22T10:00:00.000Z"));
    expect(snapshot).toEqual({
      brandName: "Rose & Ink Studio",
      contactPhone: "+91 98765 43210",
      address: "12 Palace Road",
      mapsUrl: "https://maps.google.com/?q=Rose+Ink",
      capturedAt: "2026-10-22T10:00:00.000Z",
    });
  });

  it("drops an unsafe map URL from the snapshot", () => {
    expect(brandSnapshot({ ...brand, mapsUrl: "javascript:alert(1)" }).mapsUrl).toBeNull();
  });

  it("reads valid snapshots and defaults historical fields", () => {
    expect(readBrandSnapshot(snapshotToJson(brandSnapshot(brand)))).toEqual(
      expect.objectContaining({
        brandName: "Rose & Ink Studio",
        contactPhone: "+91 98765 43210",
        address: "12 Palace Road",
      })
    );

    expect(
      readBrandSnapshot({ brandName: "Studio", contactPhone: "+91 90000 00000" })
    ).toEqual({
      brandName: "Studio",
      contactPhone: "+91 90000 00000",
      address: null,
      mapsUrl: null,
      capturedAt: "",
    });
  });

  it("rejects malformed or incomplete snapshots", () => {
    expect(readBrandSnapshot(null)).toBeNull();
    expect(readBrandSnapshot("Studio")).toBeNull();
    expect(readBrandSnapshot({ brandName: "Studio" })).toBeNull();
    expect(readBrandSnapshot({ brandName: "  ", contactPhone: "+919000000000" })).toBeNull();
  });

  it("requires a brand name and phone before a plan-covered publish", () => {
    expect(isPlannerBrandComplete(null)).toBe(false);
    expect(
      isPlannerBrandComplete({
        profileId: "p",
        brandName: "Studio",
        contactPhone: "",
        address: null,
        mapsUrl: null,
        updatedAt: null,
      })
    ).toBe(false);
    expect(isPlannerBrandComplete({ ...brand, updatedAt: null })).toBe(true);
  });

  it("only resolves branding for plan-covered invitations", async () => {
    const snapshot = brandSnapshot(brand);
    const base = {
      planner_id: "planner-1",
      planner_brand_snapshot: snapshotToJson(snapshot),
    };

    await expect(
      resolveInvitationPlannerBrand({ ...base, billing_source: "planner_plan" })
    ).resolves.toEqual(snapshot);
    await expect(
      resolveInvitationPlannerBrand({ ...base, billing_source: "one_time" })
    ).resolves.toBeNull();
    await expect(
      resolveInvitationPlannerBrand({
        billing_source: "planner_plan",
        planner_id: null,
        planner_brand_snapshot: null,
      })
    ).resolves.toBeNull();
  });
});
