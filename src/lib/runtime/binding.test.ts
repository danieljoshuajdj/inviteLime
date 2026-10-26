import { describe, expect, it, afterEach, vi } from "vitest";

import {
  createBindingScript,
  readPath,
  resolveBinding,
  sanitizeBindingUrl,
} from "./binding";
import { buildRuntimePayload, injectRuntimePayload, type RuntimeWeddingInput } from "./payload";

const WEDDING: RuntimeWeddingInput = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  slug: "aisha-and-rahul",
  brideName: "Aisha",
  groomName: "Rahul",
  brideBio: "",
  groomBio: "",
  coupleBio: "",
  story: "Met in 2019",
  date: "2026-02-14",
  time: "18:30",
  venue: "The Glasshouse",
  address: "12 Marine Drive",
  mapsUrl: "https://maps.example/venue",
  latitude: null,
  longitude: null,
  events: [],
  gallery: [],
  photos: { bride: null, groom: null, couple: "/api/media/x/couple/couple.webp" },
  music: null,
};

const payload = buildRuntimePayload({
  wedding: WEDDING,
  mode: "live",
  invitationUrl: "https://invite-lime.example/i/aisha-and-rahul",
  assetsBaseUrl: "https://cdn.example/templates/t1/v1.0.0",
});

describe("readPath", () => {
  it("reads a nested value", () => {
    expect(readPath(payload, "wedding.brideName")).toBe("Aisha");
    expect(readPath(payload, "wedding.photos.couple")).toBe("/api/media/x/couple/couple.webp");
  });

  it("returns undefined for missing, partial and non-object paths", () => {
    expect(readPath(payload, "wedding.nope")).toBeUndefined();
    expect(readPath(payload, "wedding.brideName.deeper")).toBeUndefined();
    expect(readPath(payload, "nope.nope")).toBeUndefined();
    expect(readPath(null, "wedding.brideName")).toBeUndefined();
  });
});

describe("resolveBinding", () => {
  it("resolves the documented canonical paths", () => {
    expect(resolveBinding(payload, "couple.bride.name")).toBe("Aisha");
    expect(resolveBinding(payload, "couple.groom.name")).toBe("Rahul");
    expect(resolveBinding(payload, "couple.couplePhoto")).toBe("/api/media/x/couple/couple.webp");
    expect(resolveBinding(payload, "couple.story")).toBe("Met in 2019");
  });

  it("resolves the payload's own paths", () => {
    expect(resolveBinding(payload, "wedding.date")).toBe("2026-02-14");
    expect(resolveBinding(payload, "wedding.time")).toBe("18:30");
    expect(resolveBinding(payload, "wedding.venue")).toBe("The Glasshouse");
    expect(resolveBinding(payload, "wedding.mapsUrl")).toBe("https://maps.example/venue");
    expect(resolveBinding(payload, "invitation.url")).toBe("https://invite-lime.example/i/aisha-and-rahul");
  });

  it("returns null instead of exposing nulls or empties as text", () => {
    expect(resolveBinding(payload, "wedding.photos.bride")).toBeNull();
    expect(resolveBinding(payload, "wedding.brideBio")).toBe("");
    expect(resolveBinding(payload, "wedding.missing")).toBeNull();
  });

  it("never stringifies objects into the page", () => {
    expect(resolveBinding(payload, "wedding.events")).toBeNull();
    expect(resolveBinding(payload, "wedding.photos")).toBeNull();
  });

  it("is not fooled by prototype keys", () => {
    expect(resolveBinding(payload, "constructor")).toBeNull();
    expect(resolveBinding(payload, "wedding.__proto__.x")).toBeNull();
  });

  it("ignores blank and non-string paths", () => {
    expect(resolveBinding(payload, "")).toBeNull();
    expect(resolveBinding(payload, "   ")).toBeNull();
  });
});

describe("sanitizeBindingUrl", () => {
  it("allows the schemes a template legitimately needs", () => {
    expect(sanitizeBindingUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(sanitizeBindingUrl("http://example.com/a.jpg")).toBe("http://example.com/a.jpg");
    expect(sanitizeBindingUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
    expect(sanitizeBindingUrl("tel:+911234567890")).toBe("tel:+911234567890");
    expect(sanitizeBindingUrl("/api/media/x/couple/couple.webp")).toBe("/api/media/x/couple/couple.webp");
    expect(sanitizeBindingUrl("assets/photo.png")).toBe("assets/photo.png");
  });

  it("blocks script-bearing and data URLs", () => {
    expect(sanitizeBindingUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeBindingUrl("JavaScript:alert(1)")).toBeNull();
    expect(sanitizeBindingUrl("  javascript:alert(1)")).toBeNull();
    expect(sanitizeBindingUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeBindingUrl("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeBindingUrl("file:///etc/passwd")).toBeNull();
  });

  it("blocks schemes obfuscated with control characters", () => {
    const nul = String.fromCharCode(0);
    const tab = String.fromCharCode(9);
    const newline = String.fromCharCode(10);
    expect(sanitizeBindingUrl(`java${nul}script:alert(1)`)).toBeNull();
    expect(sanitizeBindingUrl(`java${tab}script:alert(1)`)).toBeNull();
    expect(sanitizeBindingUrl(`java${newline}script:alert(1)`)).toBeNull();
    expect(sanitizeBindingUrl(`https://x.test/${nul}`)).toBeNull();
  });

  it("drops empty values so templates keep their placeholder", () => {
    expect(sanitizeBindingUrl(null)).toBeNull();
    expect(sanitizeBindingUrl("")).toBeNull();
    expect(sanitizeBindingUrl("   ")).toBeNull();
  });
});

/** Minimal element stand-in: the binder only needs these three operations. */
function el(attrs: Record<string, string>) {
  return {
    textContent: "",
    attributes: { ...attrs },
    getAttribute(name: string) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
  };
}

/** Evaluates the injected binder against a fake document, as the frame would. */
function runBinder(elements: ReturnType<typeof el>[], payloadToUse: unknown = payload) {
  const bySelector = (attribute: string) => elements.filter((n) => attribute in n.attributes);
  const selectors: Record<string, ReturnType<typeof el>[]> = {
    "[data-wedding]": bySelector("data-wedding"),
    "[data-wedding-image]": bySelector("data-wedding-image"),
    "[data-wedding-href]": bySelector("data-wedding-href"),
  };

  const document = {
    readyState: "complete",
    querySelectorAll: (selector: string) => selectors[selector] ?? [],
    addEventListener: () => {},
  };

  interface FakeWindow {
    __INVITE_LIME_RUNTIME__: unknown;
    __INVITE_LIME_BIND__?: () => void;
    addEventListener: (type: string, handler: () => void) => void;
  }

  const window: FakeWindow = {
    __INVITE_LIME_RUNTIME__: payloadToUse,
    addEventListener: () => {},
  };
  const listeners: Array<() => void> = [];
  window.addEventListener = (type: string) => {
    if (type === "invite-lime:data") listeners.push(() => window.__INVITE_LIME_BIND__?.());
  };

  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  new Function(createBindingScript())();

  return { rebind: () => listeners.forEach((fn) => fn()) };
}

/** Convenience: a payload whose wedding data differs from the default fixture. */
function payloadWith(wedding: Partial<RuntimeWeddingInput>) {
  return buildRuntimePayload({
    wedding: { ...WEDDING, ...wedding },
    mode: "live",
    invitationUrl: "https://invite-lime.example/i/x",
    assetsBaseUrl: "https://cdn.example",
  });
}

describe("injected binder script", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fills text, image and href bindings from the payload", () => {
    const heading = el({ "data-wedding": "couple.bride.name" });
    const other = el({ "data-wedding": "couple.groom.name" });
    const date = el({ "data-wedding": "wedding.date" });
    const image = el({ "data-wedding-image": "couple.couplePhoto" });
    const link = el({ "data-wedding-href": "wedding.mapsUrl" });

    runBinder([heading, other, date, image, link]);

    expect(heading.textContent).toBe("Aisha");
    expect(other.textContent).toBe("Rahul");
    expect(date.textContent).toBe("2026-02-14");
    expect(image.getAttribute("src")).toBe("/api/media/x/couple/couple.webp");
    expect(link.getAttribute("href")).toBe("https://maps.example/venue");
  });

  it("leaves a missing photo without a src instead of a broken request", () => {
    const image = el({ "data-wedding-image": "couple.bride.photo" });
    runBinder([image]);
    expect(image.getAttribute("src")).toBeNull();
  });

  it("does not set a javascript: href even if the data carries one", () => {
    const link = el({ "data-wedding-href": "wedding.mapsUrl" });
    const { rebind } = runBinder([link], payloadWith({ mapsUrl: "javascript:alert(document.cookie)" }));
    expect(link.getAttribute("href")).toBeNull();
    rebind();
    expect(link.getAttribute("href")).toBeNull();
  });

  it("re-binds when the platform re-broadcasts the payload", () => {
    const heading = el({ "data-wedding": "couple.bride.name" });
    const { rebind } = runBinder([heading], payloadWith({ brideName: "Updated" }));
    expect(heading.textContent).toBe("Updated");
    rebind();
    expect(heading.textContent).toBe("Updated");
  });
});

describe("injectRuntimePayload", () => {
  const html = "<!doctype html><html><head><title>t</title></head><body></body></html>";

  it("injects the binder alongside the payload", () => {
    const out = injectRuntimePayload(html, {
      baseHref: "https://cdn.example/templates/t1/v1.0.0/",
      payload,
    });
    expect(out).toContain("__INVITE_LIME_RUNTIME__");
    expect(out).toContain("__INVITE_LIME_BIND__");
    expect(out).toContain("data-wedding");
    // The payload script must run first so the runtime global exists.
    expect(out.indexOf("__INVITE_LIME_RUNTIME__=d")).toBeLessThan(out.indexOf("__INVITE_LIME_BIND__"));
  });

  it("stays idempotent", () => {
    const once = injectRuntimePayload(html, { baseHref: "https://cdn.example/", payload });
    expect(injectRuntimePayload(once, { baseHref: "https://cdn.example/", payload })).toBe(once);
  });

  it("inlines a self-contained binder that cannot reference module scope", () => {
    // The binder is shipped with Function.prototype.toString(), so it is
    // serialized into the frame with no module system. Anything referencing
    // module scope would throw there, and only in production.
    const script = createBindingScript();
    expect(script).not.toMatch(/require\(|import |module\.exports|__dirname/);
    expect(() => new Function(script)).not.toThrow();
  });
});
