import { afterEach, describe, expect, it, vi } from "vitest";

import { quoteFor, type TemplatePricingInput } from "./pricing";

afterEach(() => {
  vi.unstubAllEnvs();
});

const product: TemplatePricingInput = {
  price_paise: 149900,
  currency: "INR",
  prices: [
    { currency: "INR", amount_minor: 149900, active: true },
    { currency: "USD", amount_minor: 1900, active: true },
    { currency: "EUR", amount_minor: 1800, active: true },
    { currency: "GBP", amount_minor: 1500, active: false },
  ],
};

describe("quoteFor", () => {
  it("uses the base price for the base currency", () => {
    expect(quoteFor(product, "INR")).toEqual({ amountMinor: 149900, currency: "INR" });
  });

  it("uses the explicit price for the requested currency", () => {
    expect(quoteFor(product, "USD")).toEqual({ amountMinor: 1900, currency: "USD" });
    expect(quoteFor(product, "EUR")).toEqual({ amountMinor: 1800, currency: "EUR" });
  });

  it("never uses an inactive price row; falls back to the international default", () => {
    // The GBP row is inactive, so a UK visitor is quoted the USD price.
    expect(quoteFor(product, "GBP")).toEqual({ amountMinor: 1900, currency: "USD" });
  });

  it("never quotes a currency the account is not allowed to settle in", () => {
    vi.stubEnv("RAZORPAY_ALLOWED_CURRENCIES", "INR,USD");
    expect(quoteFor(product, "EUR")).toEqual({ amountMinor: 1900, currency: "USD" });
  });

  it("keeps the base currency when no explicit prices exist at all", () => {
    expect(quoteFor({ price_paise: 9900, currency: "INR" }, "USD")).toEqual({
      amountMinor: 9900,
      currency: "INR",
    });
  });

  it("ignores the product_prices row for the base currency (price_paise wins)", () => {
    const stale: TemplatePricingInput = {
      price_paise: 100000,
      currency: "INR",
      prices: [{ currency: "INR", amount_minor: 999999, active: true }],
    };
    expect(quoteFor(stale, "INR")).toEqual({ amountMinor: 100000, currency: "INR" });
  });

  it("is case-insensitive about the requested currency", () => {
    expect(quoteFor(product, "usd")).toEqual({ amountMinor: 1900, currency: "USD" });
  });
});
