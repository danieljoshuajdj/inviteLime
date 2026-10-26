/**
 * Currency detection, allow-listing and formatting for the worldwide storefront.
 *
 * This module is deliberately free of `next/headers`, the database and any other
 * server-only import so it can also be used by client components for formatting.
 * Request-scoped detection lives in `@/lib/services/geo` (server-only).
 *
 * Security model:
 *   - The browser never decides the price or the currency. It may send a hint
 *     (locale/timezone) but the server resolves the currency from trusted
 *     request metadata and looks the amount up in `product_prices`.
 *   - Only currencies present in `RAZORPAY_ALLOWED_CURRENCIES` are ever quoted,
 *     which keeps the storefront within what the Razorpay account is approved
 *     for. Anything else falls back to the home-market default.
 */

export interface CurrencyMeta {
  /** ISO-4217 alpha-3 code. */
  code: string;
  symbol: string;
  label: string;
  /** Locale used to format amounts in this currency. */
  locale: string;
  /** Digits after the decimal point (all Razorpay-supported storefront currencies use 2). */
  decimals: number;
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  INR: { code: "INR", symbol: "₹", label: "Indian Rupee", locale: "en-IN", decimals: 2 },
  USD: { code: "USD", symbol: "$", label: "US Dollar", locale: "en-US", decimals: 2 },
  EUR: { code: "EUR", symbol: "€", label: "Euro", locale: "en-IE", decimals: 2 },
  GBP: { code: "GBP", symbol: "£", label: "British Pound", locale: "en-GB", decimals: 2 },
  AED: { code: "AED", symbol: "د.إ", label: "UAE Dirham", locale: "en-AE", decimals: 2 },
  AUD: { code: "AUD", symbol: "A$", label: "Australian Dollar", locale: "en-AU", decimals: 2 },
  CAD: { code: "CAD", symbol: "C$", label: "Canadian Dollar", locale: "en-CA", decimals: 2 },
  SGD: { code: "SGD", symbol: "S$", label: "Singapore Dollar", locale: "en-SG", decimals: 2 },
};

/** Home-market currency — also the last-resort fallback. */
export const DEFAULT_CURRENCY = "INR";

/**
 * Operator-configurable home currency (`NEXT_PUBLIC_DEFAULT_CURRENCY`),
 * validated and defaulting to INR. Read as a function so the env is resolved
 * at call time rather than at module load.
 */
export function homeCurrency(): string {
  const configured = (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "").trim().toUpperCase();
  return isCurrencyCode(configured) && configured in CURRENCIES ? configured : DEFAULT_CURRENCY;
}

/** Used for detected countries we have no dedicated currency for. */
export const INTERNATIONAL_DEFAULT_CURRENCY = "USD";

/**
 * Fallback allow-list, used when `RAZORPAY_ALLOWED_CURRENCIES` is unset.
 * Production deployments should set the env var to exactly the currencies the
 * Razorpay account is approved to settle in.
 */
const DEFAULT_ENABLED = ["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"];

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

export function currencyMeta(code: string): CurrencyMeta {
  const upper = (code || "").toUpperCase();
  return (
    CURRENCIES[upper] ?? {
      code: upper || DEFAULT_CURRENCY,
      symbol: upper || DEFAULT_CURRENCY,
      label: upper || DEFAULT_CURRENCY,
      locale: "en-US",
      decimals: 2,
    }
  );
}

/**
 * Currencies enabled for this deployment, in stable order. Unknown codes are
 * dropped; if nothing valid is configured the documented default set is used.
 */
export function enabledCurrencies(): string[] {
  const raw =
    process.env.RAZORPAY_ALLOWED_CURRENCIES ??
    process.env.NEXT_PUBLIC_RAZORPAY_ALLOWED_CURRENCIES ??
    "";
  const parsed = raw
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(isCurrencyCode)
    .filter((code) => code in CURRENCIES);

  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [...DEFAULT_ENABLED];
}

export function isCurrencyEnabled(code: string | null | undefined): boolean {
  if (!code) return false;
  return enabledCurrencies().includes(code.toUpperCase());
}

/** Coerces any currency to one that is actually enabled (default if unknown). */
export function clampToEnabled(code: string | null | undefined): string {
  const enabled = enabledCurrencies();
  const upper = (code ?? "").toUpperCase();
  if (enabled.includes(upper)) return upper;
  const home = homeCurrency();
  if (enabled.includes(home)) return home;
  return enabled[0] ?? home;
}

/**
 * Country (ISO-3166 alpha-2) → storefront currency. Only countries whose
 * currency is in the supported set are mapped; everything else resolves to the
 * international default so a visitor is never quoted a currency we cannot
 * settle in.
 */
const EUROZONE = [
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
];

const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  AE: "AED",
  AU: "AUD",
  CA: "CAD",
  SG: "SGD",
  ...Object.fromEntries(EUROZONE.map((code) => [code, "EUR"])),
};

/**
 * Trusted country headers set by common edge/CDN runtimes, in priority order.
 * Values are 2-letter ISO codes; `XX`/`T1` mean "unknown" (Cloudflare TOR).
 */
const COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-country-code",
  "x-geo-country",
  "x-client-geo-country",
  "x-country",
];

/** Extracts an ISO country code from trusted headers. Returns null when unknown. */
export function countryFromHeaders(get: (name: string) => string | null | undefined): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = get(name)?.trim().toUpperCase();
    if (value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1") {
      return value;
    }
  }

  // Weak fallback: the region subtag of Accept-Language ("en-GB" → GB). Only
  // used when no edge country header is present.
  const accept = get("accept-language");
  if (accept) {
    const region = accept.split(",")[0]?.trim().split(/[-_]/)[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  }

  return null;
}

/** Maps a detected country to the currency we should quote. */
export function currencyForCountry(country: string | null | undefined): string {
  if (!country) return homeCurrency();
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? INTERNATIONAL_DEFAULT_CURRENCY;
}

/**
 * Formats an integer minor-unit amount (paise/cents) as localised currency.
 * Locale comes from the currency's home market so grouping reads naturally.
 */
export function formatCurrency(amountMinor: number, currency: string = DEFAULT_CURRENCY): string {
  const meta = currencyMeta(currency);
  const value = (Number.isFinite(amountMinor) ? amountMinor : 0) / 10 ** meta.decimals;
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      maximumFractionDigits: value % 1 === 0 ? 0 : meta.decimals,
    }).format(value);
  } catch {
    return `${meta.symbol}${value.toFixed(value % 1 === 0 ? 0 : meta.decimals)}`;
  }
}
