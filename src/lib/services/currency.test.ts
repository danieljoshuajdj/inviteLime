import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampToEnabled,
  countryFromHeaders,
  currencyForCountry,
  enabledCurrencies,
  formatCurrency,
  homeCurrency,
} from "./currency";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("enabledCurrencies", () => {
  it("defaults to the documented set when nothing is configured", () => {
    vi.stubEnv("RAZORPAY_ALLOWED_CURRENCIES", "");
    expect(enabledCurrencies()).toEqual(["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"]);
  });

  it("parses, upper-cases, de-dupes and drops unsupported codes", () => {
    vi.stubEnv("RAZORPAY_ALLOWED_CURRENCIES", "usd, EUR ,USD, XXX, inr");
    expect(enabledCurrencies()).toEqual(["USD", "EUR", "INR"]);
  });

  it("falls back to the default set when only unsupported codes are configured", () => {
    vi.stubEnv("RAZORPAY_ALLOWED_CURRENCIES", "XXX,YYY");
    expect(enabledCurrencies()).toEqual(["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"]);
  });
});

describe("clampToEnabled", () => {
  it("returns an enabled currency unchanged (normalised)", () => {
    vi.stubEnv("RAZORPAY_ALLOWED_CURRENCIES", "INR,USD");
    expect(clampToEnabled("usd")).toBe("USD");
  });

  it("falls back to the configured home currency, then the first enabled one", () => {
    vi.stubEnv("RAZORPAY_ALLOWED_CURRENCIES", "USD,EUR");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CURRENCY", "INR"); // not in the allow-list
    expect(clampToEnabled("JPY")).toBe("USD");
  });
});

describe("countryFromHeaders", () => {
  it("prefers the edge country header over Accept-Language", () => {
    const headers = new Map([
      ["cf-ipcountry", "us"],
      ["accept-language", "en-GB"],
    ]);
    expect(countryFromHeaders((name) => headers.get(name))).toBe("US");
  });

  it("ignores unknown markers and falls back to the Accept-Language region", () => {
    const headers = new Map([
      ["cf-ipcountry", "XX"],
      ["accept-language", "de-DE,de;q=0.9"],
    ]);
    expect(countryFromHeaders((name) => headers.get(name))).toBe("DE");
  });

  it("returns null when no trusted signal is available", () => {
    expect(countryFromHeaders(() => null)).toBeNull();
  });
});

describe("currencyForCountry", () => {
  it("maps supported countries to their currency", () => {
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("us")).toBe("USD");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("AE")).toBe("AED");
  });

  it("falls back to the international default for unlisted countries", () => {
    expect(currencyForCountry("JP")).toBe("USD");
  });

  it("falls back to the home currency when the country is unknown", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CURRENCY", "INR");
    expect(currencyForCountry(null)).toBe("INR");
  });
});

describe("formatCurrency", () => {
  it("formats integer minor units in the currency's own locale", () => {
    expect(formatCurrency(149900, "INR")).toContain("1,499");
    expect(formatCurrency(1900, "USD")).toBe("$19");
    expect(formatCurrency(1999, "USD")).toBe("$19.99");
  });
});

describe("homeCurrency", () => {
  it("honours a supported configured default", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CURRENCY", "eur");
    expect(homeCurrency()).toBe("EUR");
  });

  it("ignores an unsupported configured value", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CURRENCY", "XXX");
    expect(homeCurrency()).toBe("INR");
  });
});
