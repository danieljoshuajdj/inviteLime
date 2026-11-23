import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

/**
 * The sample template ships its own binding engine, so it must ingest the
 * platform runtime payload (`window.__INVITE_LIME_RUNTIME__`) itself. These
 * tests evaluate the template's inline script in a VM and exercise the
 * runtime → template-shape mapping directly, so a regression (like the demo
 * media pack silently not rendering) fails here instead of in the browser.
 */

const TEMPLATE_PATH = resolve(process.cwd(), "sample-template", "index.html");

interface TemplateHelpers {
  fromRuntime: (runtime: unknown) => Record<string, unknown> | null;
  withDemoExtras: (data: Record<string, unknown>) => Record<string, unknown>;
}

function loadTemplateHelpers(): TemplateHelpers {
  const html = readFileSync(TEMPLATE_PATH, "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const script = [...scripts].sort((a, b) => b.length - a.length)[0];
  const exposed = script.replace(
    /\}\)\(\);\s*$/,
    ";globalThis.__sampleTemplate = { fromRuntime, withDemoExtras };})();"
  );
  if (exposed === script) {
    throw new Error("sample template script no longer ends with an IIFE — update sample-template.test.ts");
  }

  const noop = () => {};
  const sandbox: Record<string, unknown> = {
    window: { addEventListener: noop, removeEventListener: noop },
    document: {
      readyState: "loading",
      addEventListener: noop,
      removeEventListener: noop,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    console,
    setTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    requestAnimationFrame: noop,
    CustomEvent: class {},
    Audio: class {},
    Image: class {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(exposed, sandbox, { filename: "sample-template/index.html" });

  const helpers = sandbox.__sampleTemplate as TemplateHelpers | undefined;
  if (!helpers) throw new Error("template helpers were not exposed to the VM");
  return helpers;
}

const helpers = loadTemplateHelpers();

const PACK = {
  bride: "/api/media/library/media/bride.webp",
  groom: "/api/media/library/media/groom.webp",
  couple: "/api/media/library/media/couple.webp",
};

function demoPayload(overrides?: Record<string, unknown>) {
  return {
    runtime: "invite-lime",
    mode: "demo",
    wedding: {
      brideName: "Bride",
      groomName: "Groom",
      brideBio: "bride bio",
      groomBio: "groom bio",
      story: "story copy",
      date: "2027-02-14",
      time: "19:00",
      venue: "Demo Palace Gardens",
      address: "Sample address",
      events: [
        {
          name: "Mehendi",
          date: "2027-02-12",
          time: "16:00",
          venue: "Courtyard",
          address: null,
          mapsUrl: null,
          description: "demo event",
        },
      ],
      photos: { ...PACK },
      gallery: [{ url: "/api/media/library/media/g1.webp" }, { url: "/api/media/library/media/g2.webp" }],
      music: null,
      brideDesignation: "Bride designation",
      groomDesignation: "Groom designation",
      dress: {
        bride: { color: "#c2647a", colorName: "Rosewood" },
        groom: { color: "#1f3d3a", colorName: "Deep teal" },
      },
      ...overrides,
    },
    rsvp: {
      enabled: true,
      deadline: "1 February 2027",
      contactName: "Anand",
      contactPhone: "+91 98765 43210",
      whatsapp: "https://wa.me/919876543210",
      whatsappNumber: "919876543210",
    },
  };
}

describe("sample template runtime ingestion", () => {
  it("reads the platform runtime global", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    expect(html).toContain("window.__INVITE_LIME_RUNTIME__");
  });

  it("does not render a parents/family section", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    expect(html).not.toContain('data-section="families"');
    expect(html).not.toContain("familiesEyebrow");
    expect(html).not.toContain("familiesTitle");
  });

  it("places the groom before the bride in the couple section", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    const start = html.indexOf('class="portrait-pair"');
    const groom = html.indexOf('data-wedding="couple.groom.name"', start);
    const bride = html.indexOf('data-wedding="couple.bride.name"', start);
    expect(start).toBeGreaterThan(-1);
    expect(groom).toBeGreaterThan(-1);
    expect(bride).toBeGreaterThan(groom);
  });

  it("maps the platform payload into the template shape", () => {
    const mapped = helpers.fromRuntime(demoPayload())!;

    expect(mapped.couple).toEqual({
      bride: {
        name: "Bride",
        photo: PACK.bride,
        bio: "bride bio",
        designation: "Bride designation",
      },
      groom: {
        name: "Groom",
        photo: PACK.groom,
        bio: "groom bio",
        designation: "Groom designation",
      },
      couplePhoto: PACK.couple,
      story: "story copy",
    });
    expect(mapped.media).toEqual({
      bridePhoto: PACK.bride,
      groomPhoto: PACK.groom,
      couplePhoto: PACK.couple,
      gallery: ["/api/media/library/media/g1.webp", "/api/media/library/media/g2.webp"],
      video: "assets/videos/hero-play.mp4",
    });
    expect(mapped.events).toEqual([
      {
        id: "event-1",
        name: "Mehendi",
        date: "2027-02-12",
        time: "16:00",
        location: { name: "Courtyard", address: null, mapsUrl: null },
        description: "demo event",
      },
      {
        id: "event-wedding",
        name: "The Wedding",
        date: "2027-02-14",
        time: "19:00",
        location: { name: "Demo Palace Gardens", address: "Sample address", mapsUrl: null },
        description: null,
      },
    ]);
    expect(mapped.rsvp).toEqual({
      enabled: true,
      preview: true,
      deadline: "1 February 2027",
      contactName: "Anand",
      contactPhone: "+91 98765 43210",
      whatsapp: "https://wa.me/919876543210",
      whatsappNumber: "919876543210",
    });
  });

  it("marks a live RSVP form as writable and a preview form as read-only", () => {
    const live = helpers.fromRuntime({ ...demoPayload(), mode: "live" })!;
    expect((live.rsvp as { preview: boolean }).preview).toBe(false);

    const preview = helpers.fromRuntime({
      ...demoPayload(),
      mode: "live",
      rsvp: { enabled: true, preview: true },
    })!;
    expect((preview.rsvp as { preview: boolean }).preview).toBe(true);
  });

  it("ships a guest RSVP form below the dress code with No selected by default", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    expect(html).toContain('id="rsvp-form"');
    expect(html).toContain('name="rsvp-attendance"');
    expect(html).toContain('name="rsvp-attendance" value="declining" checked');
    expect(html).toContain('name="phone"');
    expect(html).toContain('id="rsvp-details"');
    expect(html).toContain("invite-lime:rsvp");
    expect(html.indexOf('data-section="dress"')).toBeLessThan(html.indexOf('data-section="rsvp"'));
  });

  it("does not duplicate a wedding already listed as an event", () => {
    const mapped = helpers.fromRuntime(
      demoPayload({
        events: [
          {
            name: "Mehendi",
            date: "2027-02-12",
            time: "16:00",
            venue: "Courtyard",
            address: null,
            mapsUrl: null,
            description: "demo event",
          },
          {
            name: "Wedding Ceremony",
            date: "2027-02-14",
            time: "19:00",
            venue: "Demo Palace Gardens",
            address: null,
            mapsUrl: null,
            description: "Our vows",
          },
        ],
      })
    )!;

    expect((mapped.events as Array<{ name: string }>).map((event) => event.name)).toEqual([
      "Mehendi",
      "Wedding Ceremony",
    ]);
    expect((mapped.events as Array<{ description: string | null }>)[1].description).toBe("Our vows");
  });

  it("numbers Save-the-dates events by date and time", () => {
    const mapped = helpers.fromRuntime(
      demoPayload({
        events: [
          {
            name: "Reception",
            date: "2027-02-14",
            time: "21:00",
            venue: "Ballroom",
            address: null,
            mapsUrl: null,
            description: null,
          },
          {
            name: "Haldi",
            date: "2027-02-12",
            time: "10:00",
            venue: "Courtyard",
            address: null,
            mapsUrl: null,
            description: null,
          },
          {
            name: "Undated",
            date: null,
            time: null,
            venue: null,
            address: null,
            mapsUrl: null,
            description: null,
          },
          {
            name: "Mehendi",
            date: "2027-02-12",
            time: "16:00",
            venue: "Courtyard",
            address: null,
            mapsUrl: null,
            description: null,
          },
        ],
      })
    )!;

    expect((mapped.events as Array<{ name: string }>).map((event) => event.name)).toEqual([
      "Haldi",
      "Mehendi",
      "The Wedding",
      "Reception",
      "Undated",
    ]);
  });

  it("keeps the template's hero film in live mode", () => {
    const live = helpers.fromRuntime({ ...demoPayload(), mode: "live" })!;

    expect(live.media).toEqual(
      expect.objectContaining({ video: "assets/videos/hero-play.mp4" })
    );
  });

  it("lets an explicit customer film override the template hero film", () => {
    const mapped = helpers.fromRuntime(
      demoPayload({ video: "https://media.example.com/couple-film.mp4" })
    )!;

    expect(mapped.media).toEqual(
      expect.objectContaining({ video: "https://media.example.com/couple-film.mp4" })
    );
  });

  it("keeps template sample content out of live mode", () => {
    const mapped = helpers.fromRuntime(demoPayload())!;

    expect(mapped.families).toBeUndefined();
    expect(mapped.dress).toEqual({
      enabled: true,
      bride: { color: "#c2647a", colorName: "Rosewood" },
      groom: { color: "#1f3d3a", colorName: "Deep teal" },
    });
    expect(mapped.display).toEqual({});
    expect(mapped.music).toEqual({});
  });

  it("maps the assigned library song", () => {
    const mapped = helpers.fromRuntime(
      demoPayload({
        music: { url: "/api/music/library/track.mp3", name: "Golden Hour — Studio" },
      })
    )!;

    expect(mapped.music).toEqual({
      enabled: true,
      url: "/api/music/library/track.mp3",
      name: "Golden Hour — Studio",
    });
  });

  it("maps the planner studio brand and leaves it null otherwise", () => {
    const planner = {
      brandName: "Rose & Ink Studio",
      contactPhone: "+91 98765 43210",
      address: "12 Palace Road, Bengaluru",
      mapsUrl: "https://maps.google.com/?q=Rose+Ink",
    };
    const mapped = helpers.fromRuntime({ ...demoPayload(), planner })!;
    expect(mapped.planner).toEqual(planner);

    const customer = helpers.fromRuntime({
      ...demoPayload(),
      planner: { brandName: "Incomplete Studio" },
    })!;
    expect(customer.planner).toBeNull();
  });

  it("keeps the inline template version in step with the manifest", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "sample-template", "manifest.json"), "utf8")
    ) as { version: string };
    expect(html).toContain(`version: '${manifest.version}'`);
  });

  it("ships planner slots, a studio footer and a call/map bridge", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    expect(html).toContain('data-planner-slot');
    expect(html).toContain('data-planner-field="brandName"');
    expect(html).toContain('data-planner-link="call"');
    expect(html).toContain('data-planner-link="map"');
    expect(html).toContain("invite-lime:external-link");
    expect(html).toContain("[data-planner-slot][hidden]");
  });

  it("falls back to the template's own demo dress code when none is assigned", () => {
    const mapped = helpers.fromRuntime(
      demoPayload({ dress: null, brideDesignation: null, groomDesignation: null })
    )!;

    expect(mapped.dress).toEqual({});
    expect(mapped.couple).toEqual(
      expect.objectContaining({
        bride: expect.objectContaining({ designation: null }),
        groom: expect.objectContaining({ designation: null }),
      })
    );

    const demo = helpers.withDemoExtras(mapped);
    expect(demo.dress).toEqual({
      enabled: true,
      bride: { color: "#c2647a", colorName: "Dusty Rose" },
      groom: { color: "#7c3a5e", colorName: "Deep Berry" },
    });
    expect(demo.couple).toEqual(
      expect.objectContaining({
        bride: expect.objectContaining({
          designation: "B.Com. — Wells Fargo International Pvt. Ltd., Bangalore.",
        }),
      })
    );
  });

  it("fills demo-only content under the runtime data in demo mode", () => {
    const demo = helpers.withDemoExtras(helpers.fromRuntime(demoPayload())!);

    expect(demo.couple).toEqual(
      expect.objectContaining({
        bride: expect.objectContaining({ name: "Bride", photo: PACK.bride, animatedPose: "bride-pose-01" }),
      })
    );
    expect(demo.families).toBeUndefined();
    expect(demo.media).toEqual(
      expect.objectContaining({ gallery: ["/api/media/library/media/g1.webp", "/api/media/library/media/g2.webp"] })
    );
    // No song is bundled with the template any more: the platform assigns one.
    expect(demo.music).toEqual({});
    expect(demo.rsvp).toEqual(expect.objectContaining({ whatsapp: "https://wa.me/919876543210" }));
  });

  it("leaves photos unset when no pack is assigned so pose assets render", () => {
    const mapped = helpers.fromRuntime(
      demoPayload({ photos: { bride: null, groom: null, couple: null }, gallery: [] })
    )!;

    expect(mapped.media).toEqual({
      bridePhoto: null,
      groomPhoto: null,
      couplePhoto: null,
      gallery: [],
      video: "assets/videos/hero-play.mp4",
    });
    const demo = helpers.withDemoExtras(mapped);
    expect(demo.couple).toEqual(
      expect.objectContaining({ bride: expect.objectContaining({ animatedPose: "bride-pose-01" }) })
    );
  });

  it("ignores input without a wedding payload", () => {
    expect(helpers.fromRuntime(null)).toBeNull();
    expect(helpers.fromRuntime({})).toBeNull();
    expect(helpers.fromRuntime({ wedding: "nope" })).toBeNull();
  });
});
