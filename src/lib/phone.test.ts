import { describe, expect, it } from "vitest";

import { hasPhoneDigits, normalizeWhatsappNumber, whatsappChatUrl } from "./phone";

describe("normalizeWhatsappNumber", () => {
  it("strips formatting and the international 00 prefix", () => {
    expect(normalizeWhatsappNumber("+91 98765 43210")).toBe("919876543210");
    expect(normalizeWhatsappNumber("0091 98765 43210")).toBe("919876543210");
  });

  it("rejects numbers that are too short or empty", () => {
    expect(normalizeWhatsappNumber("12345")).toBeNull();
    expect(normalizeWhatsappNumber("")).toBeNull();
    expect(normalizeWhatsappNumber(null)).toBeNull();
  });
});

describe("whatsappChatUrl", () => {
  it("creates a click-to-chat link with encoded text", () => {
    expect(whatsappChatUrl("+91 98765 43210", "Hello & welcome")).toBe(
      "https://wa.me/919876543210?text=Hello%20%26%20welcome"
    );
  });

  it("returns null without a usable number", () => {
    expect(whatsappChatUrl("nope", "Hello")).toBeNull();
  });
});

describe("hasPhoneDigits", () => {
  it("accepts formatted phone numbers with at least seven digits", () => {
    expect(hasPhoneDigits("+91 98765 43210")).toBe(true);
    expect(hasPhoneDigits("123")).toBe(false);
    expect(hasPhoneDigits(null)).toBe(false);
  });
});
