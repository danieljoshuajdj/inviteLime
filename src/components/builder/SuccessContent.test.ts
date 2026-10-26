import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InvitationQrCode, SuccessContent } from "./SuccessContent";

type Wedding = Parameters<typeof SuccessContent>[0]["wedding"];

const baseWedding: Wedding = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "ananya-rohan",
  template_id: "template-1",
  template_version_id: "version-1",
  templateName: "Ivory Lotus",
  brideName: "Ananya Sharma",
  groomName: "Rohan Mehta",
  brideBio: null,
  groomBio: null,
  coupleBio: null,
  story: null,
  weddingDate: "2026-12-12",
  weddingTime: "19:30",
  venue: "The Leela Palace, Bengaluru",
  address: "23 Old Airport Road, Bengaluru",
  mapsUrl: null,
  latitude: null,
  longitude: null,
  events: [],
  gallery: [],
  couplePhoto: "https://example.com/couple.jpg",
  email: "ananya@example.com",
  expirationDate: "2027-02-12",
  status: "active",
};

type SuccessProps = Parameters<typeof SuccessContent>[0];

function markup(
  overrides: Partial<Wedding> = {},
  props: Partial<Omit<SuccessProps, "wedding">> = {}
): string {
  return renderToStaticMarkup(
    createElement(SuccessContent, { wedding: { ...baseWedding, ...overrides }, ...props })
  );
}

describe("SuccessContent phone preview", () => {
  it("shows the purchased template name instead of the sample template", () => {
    const html = markup();
    expect(html).toContain("Ivory Lotus");
    expect(html).not.toContain("Royal Mughal Palace");
  });

  it("plays the published invitation inside the phone frame", () => {
    const html = markup();
    // The frame hosts the live invitation (with its uploaded template package)
    // rather than a static mock-up.
    expect(html).toContain('src="/w/ananya-rohan?embed=1"');
    expect(html).not.toContain("Taj Falaknuma Palace");
    expect(html).not.toContain("Half Past Six in the Evening");
    expect(html).not.toContain("ENCRYPTED GUEST PASS");
  });

  it("renders the share link without a browser-only origin on the server", () => {
    // `window.location.origin` is read after mount; using it during render made
    // the server (`/w/slug`) and client (`http://host/w/slug`) disagree and
    // React reported a hydration mismatch.
    const html = markup();
    expect(html).toContain("/w/ananya-rohan");
    expect(html).not.toContain("http://localhost");
  });

  it("includes the studio brand in the share message", () => {
    const html = markup({}, { plannerBrandName: "Kingpin Wedding company" });

    expect(html).toContain("Kingpin%20Wedding%20company");
    expect(html).toContain("Rohan%20%26%20Ananya");
    expect(markup()).not.toContain("presented%20by");
  });

  it("generates a scannable QR code for the invitation URL", () => {
    const html = renderToStaticMarkup(
      createElement(InvitationQrCode, { url: "https://invite.example.com/w/ananya-rohan" })
    );
    // A real code is a grid of modules; the placeholder was a solid block.
    const grid = /viewBox="0 0 (\d+) \d+"/.exec(html);
    expect(grid).not.toBeNull();
    expect(Number(grid?.[1])).toBeGreaterThanOrEqual(21);
    // Each dark module is its own subpath, so a real code has many of them.
    expect((html.match(/z/g) ?? []).length).toBeGreaterThan(50);
    expect(html).not.toContain("animate-pulse");
  });

  it("falls back to a generic template label when the purchase has none", () => {
    const html = markup({
      templateName: null,
      venue: null,
      address: null,
      weddingTime: null,
      couplePhoto: null,
    });
    expect(html).toContain("Wedding Invitation");
  });
});
