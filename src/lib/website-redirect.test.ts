import { describe, expect, it } from "vitest";

import {
  MAX_WEBSITE_URL_LENGTH,
  normalizeWebsiteDestination,
  websiteRedirectHref,
} from "./website-redirect";

describe("normalizeWebsiteDestination", () => {
  it("accepts full HTTP(S) destinations and canonicalises them", () => {
    expect(normalizeWebsiteDestination("https://myoldwebsite.com")).toBe(
      "https://myoldwebsite.com/"
    );
    expect(normalizeWebsiteDestination("  https://myoldwebsite.com  ")).toBe(
      "https://myoldwebsite.com/"
    );
    expect(normalizeWebsiteDestination("http://localhost:3000")).toBe(
      "http://localhost:3000/"
    );
    expect(normalizeWebsiteDestination("https://example.com/path?x=1#top")).toBe(
      "https://example.com/path?x=1#top"
    );
    expect(normalizeWebsiteDestination("https://example.com:8443/path")).toBe(
      "https://example.com:8443/path"
    );
  });

  it("assumes HTTPS for a bare domain or host:port", () => {
    expect(normalizeWebsiteDestination("mynewwebsite.com")).toBe(
      "https://mynewwebsite.com/"
    );
    expect(normalizeWebsiteDestination("www.example.com/invite")).toBe(
      "https://www.example.com/invite"
    );
    expect(normalizeWebsiteDestination("example.com:8080")).toBe(
      "https://example.com:8080/"
    );
    expect(normalizeWebsiteDestination("127.0.0.1:4000")).toBe(
      "https://127.0.0.1:4000/"
    );
    expect(normalizeWebsiteDestination("https://[::1]:3000")).toBe(
      "https://[::1]:3000/"
    );
  });

  it("treats blank input as 'no destination'", () => {
    expect(normalizeWebsiteDestination("")).toBeNull();
    expect(normalizeWebsiteDestination("   ")).toBeNull();
    expect(normalizeWebsiteDestination(null)).toBeNull();
    expect(normalizeWebsiteDestination(undefined)).toBeNull();
    expect(normalizeWebsiteDestination(42)).toBeNull();
  });

  it("rejects non-HTTP schemes", () => {
    expect(normalizeWebsiteDestination("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsiteDestination("JavaScript:alert(1)")).toBeNull();
    expect(normalizeWebsiteDestination("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeWebsiteDestination("ftp://example.com")).toBeNull();
    expect(normalizeWebsiteDestination("mailto:hello@example.com")).toBeNull();
    expect(normalizeWebsiteDestination("tel:+911234567890")).toBeNull();
    expect(normalizeWebsiteDestination("file:///etc/passwd")).toBeNull();
  });

  it("rejects credentials, protocol-relative input and malformed hosts", () => {
    expect(normalizeWebsiteDestination("https://user:pass@example.com")).toBeNull();
    expect(normalizeWebsiteDestination("//example.com")).toBeNull();
    expect(normalizeWebsiteDestination("mywebsite")).toBeNull();
    expect(normalizeWebsiteDestination("https://")).toBeNull();
    expect(normalizeWebsiteDestination("http://")).toBeNull();
    expect(normalizeWebsiteDestination("https://http://")).toBeNull();
  });

  it("rejects control characters, backslashes and over-long values", () => {
    const nul = String.fromCharCode(0);
    expect(normalizeWebsiteDestination(`https://example.com/${nul}`)).toBeNull();
    expect(normalizeWebsiteDestination("https://example.com\\@evil.com")).toBeNull();
    expect(
      normalizeWebsiteDestination(`https://example.com/${"a".repeat(MAX_WEBSITE_URL_LENGTH)}`)
    ).toBeNull();
  });
});

describe("websiteRedirectHref", () => {
  it("builds the permanent link on the origin the guest actually used", () => {
    expect(websiteRedirectHref("https://invite.example.com")).toBe(
      "https://invite.example.com/visit-website"
    );
    expect(websiteRedirectHref("https://invite.example.com/")).toBe(
      "https://invite.example.com/visit-website"
    );
    expect(websiteRedirectHref("http://localhost:3000")).toBe(
      "http://localhost:3000/visit-website"
    );
  });
});
