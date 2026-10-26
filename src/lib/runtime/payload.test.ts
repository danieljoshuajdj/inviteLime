import { afterEach, describe, expect, it } from "vitest";

import {
  buildRuntimePayload,
  gallerySectionStyle,
  injectRuntimePayload,
  looksLikeHtmlDocument,
  serializePayload,
  templateAssetBaseUrl,
  type RuntimePayload,
  type RuntimeWeddingInput,
} from "@/lib/runtime/payload";

const wedding: RuntimeWeddingInput = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "aarav-weds-meera-2027",
  brideName: "Meera",
  groomName: "Aarav",
  brideBio: "",
  groomBio: "",
  coupleBio: "",
  story: "",
  date: "2027-02-14",
  time: "19:00",
  venue: "Palace Gardens",
  address: "Somewhere",
  mapsUrl: null,
  latitude: null,
  longitude: null,
  events: [],
  gallery: [],
  photos: { bride: null, groom: null, couple: null },
  music: null,
};

function payload(): RuntimePayload {
  return buildRuntimePayload({
    wedding,
    mode: "live",
    invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
    expiresAt: "2027-04-14T00:00:00.000Z",
    assetsBaseUrl: "https://invite-lime.example",
    rsvp: { enabled: true, attendingCount: 4, responseCount: 6 },
  });
}

describe("templateAssetBaseUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.B2_ENDPOINT;
    delete process.env.B2_KEY_ID;
    delete process.env.B2_APPLICATION_KEY;
    delete process.env.B2_PUBLIC_BASE_URL;
  });

  it("builds the immutable Supabase public asset prefix by default", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co/";
    expect(templateAssetBaseUrl("/abc/v1.0.0/")).toBe(
      "https://x.supabase.co/storage/v1/object/public/templates/abc/v1.0.0/"
    );
  });

  it("builds the asset prefix from the signed /api/templates proxy when B2 is configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co/";
    process.env.B2_ENDPOINT = "https://s3.us-west-000.backblazeb2.com";
    process.env.B2_KEY_ID = "k";
    process.env.B2_APPLICATION_KEY = "a";
    expect(templateAssetBaseUrl("/abc/v1.0.0/")).toMatch(
      /^\/api\/templates\/\d+\.[a-f0-9]+\/abc\/v1\.0\.0\/$/
    );
  });
});

describe("buildRuntimePayload", () => {
  it("exposes public invitation data only", () => {
    const p = payload();
    expect(p.contract).toBe("1.0");
    expect(p.mode).toBe("live");
    expect(p.wedding.brideName).toBe("Meera");
    expect(p.rsvp.attendingCount).toBe(4);
    expect(p.assets.baseUrl).toBe("https://invite-lime.example/");
    // No private fields ever reach a template.
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("user_id");
  });

  it("normalises the customer WhatsApp number for the RSVP handoff", () => {
    const p = buildRuntimePayload({
      wedding,
      mode: "live",
      invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
      assetsBaseUrl: "https://invite-lime.example/",
      rsvp: { enabled: true, whatsappNumber: "+91 98765 43210" },
    });
    expect(p.rsvp.whatsappNumber).toBe("919876543210");
  });

  it("defaults rsvp values and endpoint", () => {
    const p = buildRuntimePayload({
      wedding,
      mode: "demo",
      invitationUrl: "https://invite-lime.example/demo",
      assetsBaseUrl: "https://invite-lime.example/",
    });
    expect(p.rsvp).toEqual({
      enabled: false,
      preview: false,
      deadline: null,
      attendingCount: 0,
      responseCount: 0,
      endpoint: "/api/rsvp",
      contactName: null,
      contactPhone: null,
      whatsapp: null,
      whatsappNumber: null,
    });
    expect(p.mode).toBe("demo");
  });

  it("defaults planner branding to null for customer and demo invitations", () => {
    expect(payload().planner).toBeNull();

    const demo = buildRuntimePayload({
      wedding,
      mode: "demo",
      invitationUrl: "https://invite-lime.example/demo",
      assetsBaseUrl: "https://invite-lime.example/",
    });
    expect(demo.planner).toBeNull();
  });

  it("passes a planner studio brand through the runtime payload", () => {
    const planner = {
      brandName: "Rose & Ink Studio",
      contactPhone: "+91 98765 43210",
      address: "12 Palace Road",
      mapsUrl: "https://maps.google.com/?q=Rose+Ink",
    };
    const p = buildRuntimePayload({
      wedding,
      mode: "live",
      invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
      assetsBaseUrl: "https://invite-lime.example/",
      planner,
    });
    expect(p.planner).toEqual(planner);
  });

  it("defaults demo-only extras and passes them through when supplied", () => {
    const plain = payload();
    expect(plain.wedding.brideDesignation).toBeNull();
    expect(plain.wedding.groomDesignation).toBeNull();
    expect(plain.wedding.dress).toBeNull();

    const withExtras = buildRuntimePayload({
      wedding: {
        ...wedding,
        brideDesignation: "Bride designation",
        groomDesignation: "Groom designation",
        dress: {
          bride: { color: "#c2647a", colorName: "Rosewood" },
          groom: { color: "#1f3d3a", colorName: "Deep teal" },
        },
      },
      mode: "demo",
      invitationUrl: "https://invite-lime.example/demo",
      assetsBaseUrl: "https://invite-lime.example/",
    });

    expect(withExtras.wedding.brideDesignation).toBe("Bride designation");
    expect(withExtras.wedding.dress?.bride).toEqual({
      color: "#c2647a",
      colorName: "Rosewood",
    });
  });
});

describe("injectRuntimePayload", () => {
  it("injects a base tag and the payload script into <head>", () => {
    const html = "<!doctype html><html><head><title>t</title></head><body></body></html>";
    const out = injectRuntimePayload(html, {
      baseHref: "https://cdn.example/templates/abc/v1.0.0/",
      payload: payload(),
    });
    expect(out).toContain('<base href="https://cdn.example/templates/abc/v1.0.0/">');
    expect(out).toContain("window.__INVITE_LIME_RUNTIME__=d");
    expect(out).toContain('data-invite-lime-runtime="1"');
    expect(out.indexOf("data-invite-lime-runtime")).toBeLessThan(out.indexOf("</head>"));
  });

  it("synthesises a head when the template has none", () => {
    const out = injectRuntimePayload("<html><body>hi</body></html>", {
      baseHref: "https://cdn.example/",
      payload: payload(),
    });
    expect(out).toContain("<head><base href=\"https://cdn.example/\">");
  });

  it("is idempotent so a cached document is never double-injected", () => {
    const first = injectRuntimePayload("<html><head></head><body></body></html>", {
      baseHref: "https://cdn.example/",
      payload: payload(),
    });
    const second = injectRuntimePayload(first, {
      baseHref: "https://cdn.example/",
      payload: payload(),
    });
    expect(second).toBe(first);
  });

  it("serializes payloads without breaking out of the script tag", () => {
    const json = serializePayload({ evil: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003c");
  });

  it("escapes the base href attribute", () => {
    const out = injectRuntimePayload("<html><head></head></html>", {
      baseHref: 'https://cdn.example/a"b/',
      payload: payload(),
    });
    expect(out).toContain("&quot;b/");
  });

  it("injects fallback planner branding into templates without planner slots", () => {
    const planner = {
      brandName: "Rose & Ink <Studio>",
      contactPhone: "+91 98765 43210",
      address: null,
      mapsUrl: "https://maps.google.com/?q=Rose+Ink",
    };
    const p = buildRuntimePayload({
      wedding,
      mode: "live",
      invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
      assetsBaseUrl: "https://invite-lime.example/",
      planner,
    });
    const out = injectRuntimePayload(
      "<html><head></head><body><main>invitation</main></body></html>",
      { baseHref: "https://cdn.example/", payload: p }
    );

    expect(out).toContain("data-planner-fallback");
    expect(out).toContain("Rose &amp; Ink &lt;Studio&gt;");
    expect(out).toContain("tel:+919876543210");
    expect(out).toContain("View map");
    expect(out.indexOf("data-planner-fallback")).toBeLessThan(out.indexOf("</body>"));
  });

  it("does not inject fallback branding when the template owns planner slots", () => {
    const planner = {
      brandName: "Rose & Ink Studio",
      contactPhone: "+91 98765 43210",
      address: null,
      mapsUrl: null,
    };
    const p = buildRuntimePayload({
      wedding,
      mode: "live",
      invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
      assetsBaseUrl: "https://invite-lime.example/",
      planner,
    });
    const out = injectRuntimePayload(
      '<html><head></head><body><div data-planner-slot><span data-planner-field="brandName"></span></div></body></html>',
      { baseHref: "https://cdn.example/", payload: p }
    );

    expect(out).not.toContain("data-planner-fallback");
  });

  it("never injects planner branding into customer invitations", () => {
    const out = injectRuntimePayload("<html><head></head><body></body></html>", {
      baseHref: "https://cdn.example/",
      payload: payload(),
    });
    expect(out).not.toContain("data-planner-fallback");
  });
});

describe("gallerySectionStyle", () => {
  const galleryItem = { url: "https://cdn.example/photo.jpg" };

  it("hides the gallery section when a live invitation has no photos", () => {
    const out = injectRuntimePayload("<html><head></head><body></body></html>", {
      baseHref: "https://cdn.example/",
      payload: payload(),
    });
    expect(out).toContain('data-invite-lime-gallery="1"');
    expect(out).toContain('[data-section="gallery"]{display:none!important}');
    // Must land before the template's own markup renders.
    expect(out.indexOf("data-invite-lime-gallery")).toBeLessThan(out.indexOf("</head>"));
  });

  it("leaves the gallery alone once the couple has photos", () => {
    const withPhotos = buildRuntimePayload({
      wedding: { ...wedding, gallery: [galleryItem, galleryItem] },
      mode: "live",
      invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
      assetsBaseUrl: "https://invite-lime.example",
    });
    const out = injectRuntimePayload("<html><head></head><body></body></html>", {
      baseHref: "https://cdn.example/",
      payload: withPhotos,
    });
    expect(out).not.toContain("data-invite-lime-gallery");
  });

  it("does not touch demo mode, where templates may show their own demo media", () => {
    const demo = buildRuntimePayload({
      wedding,
      mode: "demo",
      invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
      assetsBaseUrl: "https://invite-lime.example",
    });
    const out = injectRuntimePayload("<html><head></head><body></body></html>", {
      baseHref: "https://cdn.example/",
      payload: demo,
    });
    expect(out).not.toContain("data-invite-lime-gallery");
  });

  it("never injects a style when the gallery style is not applicable", () => {
    expect(gallerySectionStyle(payload())).toContain('[data-section="gallery"]');

    const withPhotos = buildRuntimePayload({
      wedding: { ...wedding, gallery: [galleryItem] },
      mode: "live",
      invitationUrl: "https://invite-lime.example/w/aarav-weds-meera-2027",
      assetsBaseUrl: "https://invite-lime.example",
    });
    expect(gallerySectionStyle(withPhotos)).toBe("");
  });
});

describe("looksLikeHtmlDocument", () => {
  it("accepts real documents and rejects error payloads", () => {
    expect(looksLikeHtmlDocument("<!doctype html><html>")).toBe(true);
    expect(looksLikeHtmlDocument('{"error":"not found"}')).toBe(false);
  });
});
