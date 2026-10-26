import { headers } from "next/headers";

import { clampToEnabled, countryFromHeaders, currencyForCountry } from "./currency";

/**
 * Request-scoped currency detection.
 *
 * Server-only by convention (it reads `next/headers`); it is intentionally not
 * marked with the `server-only` package so route handlers stay unit-testable,
 * matching `@/lib/services/payments`.
 *
 * Country comes from the trusted edge/CDN header set (Vercel, Cloudflare, ...)
 * with an `Accept-Language` regional fallback; the currency is then clamped to
 * the operator's `RAZORPAY_ALLOWED_CURRENCIES` allow-list. Nothing here trusts
 * a value supplied by the browser as more than a hint.
 */

/** Resolves the storefront currency for an incoming `Request` (route handlers). */
export function currencyFromRequest(req: Request): string {
  const country = countryFromHeaders((name) => req.headers.get(name));
  return clampToEnabled(currencyForCountry(country));
}

/** Resolves the storefront currency for the current server-rendered request. */
export async function getRequestCurrency(): Promise<string> {
  const store = await headers();
  const country = countryFromHeaders((name) => store.get(name));
  return clampToEnabled(currencyForCountry(country));
}
