import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultWeddingData } from "@/lib/builder/defaults";
import type { PublicWeddingRecord } from "@/lib/services/weddings";

import { InvitationRuntime, invitationNav } from "./InvitationRuntime";

describe("built-in invitation runtime gallery section", () => {
  it("shows no gallery or RSVP tab by default", () => {
    const ids = invitationNav(defaultWeddingData()).map((item) => item.id);

    expect(ids).toEqual(["home", "story", "events"]);
    expect(ids).not.toContain("gallery");
    expect(ids).not.toContain("rsvp");
  });

  it("shows the RSVP tab once the customer enables responses", () => {
    const ids = invitationNav(
      defaultWeddingData({ rsvpEnabled: true })
    ).map((item) => item.id);

    expect(ids).toEqual(["home", "story", "events", "rsvp"]);
  });

  it("shows the gallery tab once there is at least one photo", () => {
    const data = defaultWeddingData({
      gallery: [{ role: "gallery", url: "https://cdn.example/one.jpg", name: "one.jpg" }],
    });

    expect(invitationNav(data).map((item) => item.id)).toEqual([
      "home",
      "story",
      "events",
      "gallery",
    ]);
  });

  it("treats a missing gallery list like an empty one", () => {
    const data = defaultWeddingData();
    // Drafts saved before the gallery field existed still hydrate.
    delete (data as { gallery?: unknown }).gallery;

    expect(invitationNav(data).map((item) => item.id)).not.toContain("gallery");
  });

  it("keeps every tab labelled and ordered for the mobile bottom bar", () => {
    const nav = invitationNav(defaultWeddingData({ rsvpEnabled: true }));

    expect(nav.map((item) => item.label)).toEqual(["Home", "Our Story", "Events", "RSVP"]);
    expect(nav.every((item) => item.icon.length > 0)).toBe(true);
  });

  it("drops the RSVP tab when the customer disables responses", () => {
    expect(invitationNav(defaultWeddingData(), false).map((item) => item.id)).toEqual([
      "home",
      "story",
      "events",
    ]);
  });
});

describe("built-in invitation runtime planner branding", () => {
  const wedding = {
    id: "wedding-1",
    slug: "meera-weds-aarav",
    bride_name: "Meera",
    groom_name: "Aarav",
    celebrant_name: null,
    form_type: "wedding",
    wedding_date: "2027-02-14",
    venue: null,
    address: null,
    maps_url: null,
    template_id: "template-1",
    template_version_id: "version-1",
    wedding_data: {},
    expiration_date: null,
    rsvp_toggle: true,
    rsvp_deadline: null,
    planner_id: "planner-1",
    planner_brand_snapshot: null,
    billing_source: "planner_plan",
  } satisfies PublicWeddingRecord;

  function render(planner: { brandName: string; contactPhone: string; address: string | null; mapsUrl: string | null } | null) {
    return renderToStaticMarkup(
      createElement(InvitationRuntime, {
        wedding,
        weddingData: defaultWeddingData() as never,
        rsvpCount: 0,
        attendingCount: 0,
        planner,
      })
    );
  }

  it("shows the studio credit on the cover of a plan-covered invitation", () => {
    const html = render({
      brandName: "Rose & Ink Studio",
      contactPhone: "+91 98765 43210",
      address: "12 Palace Road",
      mapsUrl: "https://maps.google.com/?q=Rose+Ink",
    });
    expect(html).toContain("Presented by");
    expect(html).toContain("Rose &amp; Ink Studio");
  });

  it("shows no studio branding on a customer invitation", () => {
    expect(render(null)).not.toContain("Presented by");
  });
});
