import { describe, expect, it } from "vitest";

import {
  EXTERNAL_LINK_MESSAGE,
  parseExternalLinkMessage,
} from "@/lib/runtime/external-link";

describe("parseExternalLinkMessage", () => {
  it("accepts telephone links and normalises the number", () => {
    expect(
      parseExternalLinkMessage({
        type: EXTERNAL_LINK_MESSAGE,
        href: " tel:+91 (98765) 43210 ",
      })
    ).toBe("tel:+919876543210");
  });

  it("rejects a telephone link without a usable number", () => {
    expect(parseExternalLinkMessage({ type: EXTERNAL_LINK_MESSAGE, href: "tel:" })).toBeNull();
    expect(parseExternalLinkMessage({ type: EXTERNAL_LINK_MESSAGE, href: "tel:12" })).toBeNull();
  });

  it("accepts http and https map links", () => {
    expect(
      parseExternalLinkMessage({
        type: EXTERNAL_LINK_MESSAGE,
        href: "https://maps.google.com/?q=Rose+Ink",
      })
    ).toBe("https://maps.google.com/?q=Rose+Ink");
    expect(
      parseExternalLinkMessage({
        type: EXTERNAL_LINK_MESSAGE,
        href: "http://example.com/studio",
      })
    ).toBe("http://example.com/studio");
  });

  it("rejects script, data and relative links", () => {
    expect(
      parseExternalLinkMessage({ type: EXTERNAL_LINK_MESSAGE, href: "javascript:alert(1)" })
    ).toBeNull();
    expect(
      parseExternalLinkMessage({ type: EXTERNAL_LINK_MESSAGE, href: "data:text/html,hi" })
    ).toBeNull();
    expect(parseExternalLinkMessage({ type: EXTERNAL_LINK_MESSAGE, href: "/w/slug" })).toBeNull();
  });

  it("rejects unrelated or malformed messages", () => {
    expect(parseExternalLinkMessage(null)).toBeNull();
    expect(parseExternalLinkMessage("https://example.com")).toBeNull();
    expect(parseExternalLinkMessage({ type: "invite-lime:rsvp" })).toBeNull();
    expect(
      parseExternalLinkMessage({ type: EXTERNAL_LINK_MESSAGE, href: 42 })
    ).toBeNull();
  });
});
