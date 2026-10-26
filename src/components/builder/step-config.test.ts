import { describe, expect, it } from "vitest";

import { defaultWeddingData, type WeddingData } from "@/lib/builder/defaults";

import { buildStepper, coupleComplete, detailsComplete, mediaComplete, weddingComplete } from "./step-config";

function data(patch: Partial<WeddingData> = {}): WeddingData {
  return { ...defaultWeddingData(), ...patch };
}

function completeById(d: WeddingData): Record<string, boolean> {
  return Object.fromEntries(buildStepper(d).map((s) => [s.id, s.complete]));
}

describe("step completion is driven by content, not position", () => {
  it("merges couple, schedule, guest and media details into one form step", () => {
    expect(buildStepper(data()).map((s) => s.id)).toEqual(["details", "preview", "review"]);
  });

  it("marks the details step incomplete for an empty draft", () => {
    expect(completeById(data())).toEqual({
      details: false,
      preview: true,
      review: true,
    });
  });

  it("completes details only when all required fields are present", () => {
    const required = { brideName: "Meera", groomName: "Aarav", weddingDate: "2027-02-14", venue: "Lisbon" };

    expect(detailsComplete(data(required))).toBe(true);
    expect(detailsComplete(data({ ...required, brideName: "" }))).toBe(false);
    expect(detailsComplete(data({ ...required, weddingDate: "" }))).toBe(false);
    expect(detailsComplete(data({ ...required, venue: "  " }))).toBe(false);
  });

  it("does not complete the details step from wedding details alone", () => {
    const d = data({ weddingDate: "2027-02-14", venue: "Lisbon" });
    expect(coupleComplete(d)).toBe(false);
    expect(weddingComplete(d)).toBe(true);
    expect(detailsComplete(d)).toBe(false);
  });

  it("requires both names, not just one", () => {
    expect(coupleComplete(data({ brideName: "Meera" }))).toBe(false);
    expect(coupleComplete(data({ groomName: "Aarav" }))).toBe(false);
    expect(coupleComplete(data({ brideName: "Meera", groomName: "Aarav" }))).toBe(true);
  });

  it("treats whitespace-only names as incomplete", () => {
    expect(coupleComplete(data({ brideName: "   ", groomName: "Aarav" }))).toBe(false);
  });

  it("requires both date and venue", () => {
    expect(weddingComplete(data({ weddingDate: "2027-02-14" }))).toBe(false);
    expect(weddingComplete(data({ venue: "Lisbon" }))).toBe(false);
    expect(weddingComplete(data({ weddingDate: "2027-02-14", venue: "Lisbon" }))).toBe(true);
  });

  it.each([
    ["a gallery photo", { gallery: ["https://x/a.jpg"] as unknown as WeddingData["gallery"] }],
    ["a bride photo", { bridePhoto: "https://x/b.jpg" }],
    ["a groom photo", { groomPhoto: "https://x/g.jpg" }],
    ["a couple photo", { couplePhoto: "https://x/c.jpg" }],
    ["music", { music: { url: "https://x/m.mp3", name: "m" } as unknown as WeddingData["music"] }],
  ])("detects media from %s", (_label, patch) => {
    expect(mediaComplete(data(patch))).toBe(true);
  });

  it("keeps media incomplete when nothing has been added", () => {
    expect(mediaComplete(data({ gallery: [], music: null, bridePhoto: null }))).toBe(false);
  });

  it("does not let optional media mask a missing required detail", () => {
    const full = data({
      brideName: "Meera",
      groomName: "Aarav",
      weddingDate: "2027-02-14",
      venue: "Lisbon",
      bridePhoto: "https://x/b.jpg",
    });

    expect(buildStepper(full)[0]!.complete).toBe(true);

    // Clearing one required field must flip the combined step back.
    expect(buildStepper({ ...full, brideName: "" })[0]!.complete).toBe(false);
    expect(buildStepper({ ...full, weddingDate: "" })[0]!.complete).toBe(false);
    expect(buildStepper({ ...full, venue: "" })[0]!.complete).toBe(false);
  });
});
