import { createAdminClient } from "@/lib/supabase/admin";

import {
  INTERNATIONAL_DEFAULT_CURRENCY,
  enabledCurrencies,
  formatCurrency,
  homeCurrency,
} from "./currency";

/**
 * Server-side price resolution.
 *
 * Server-only by convention (it uses the service-role admin client); not marked
 * with the `server-only` package so checkout routes stay unit-testable.
 *
 * The storefront shows an explicit price per currency (see the
 * `product_prices` table); this module is the single place that turns a
 * template/product row into the amount we actually charge, in the currency we
 * actually settle in.
 *
 * The output of `resolveProductQuote` is the only amount ever handed to
 * Razorpay — the browser's number is never trusted.
 */

export interface PriceQuote {
  /** Integer minor units (paise/cents). */
  amountMinor: number;
  /** ISO-4217 code the amount is denominated in. */
  currency: string;
}

export interface CurrencyPrice {
  currency: string;
  amount_minor: number;
  active?: boolean | null;
}

/** Shape of a template/product row that carries base + per-currency prices. */
export interface TemplatePricingInput {
  price_paise?: number | null;
  currency?: string | null;
  prices?: Array<CurrencyPrice | null> | null;
}

/**
 * Resolves the price to charge for `requestedCurrency`, given a product's base
 * INR price and its explicit per-currency price rows.
 *
 * Priority: explicit price in the requested currency → the base price when the
 * requested currency *is* the base currency → USD → any other enabled explicit
 * price → the base price. Only enabled currencies are considered, so the result
 * is always a currency we are allowed to settle in.
 */
export function quoteFor(template: TemplatePricingInput, requestedCurrency: string): PriceQuote {
  const enabled = enabledCurrencies();
  const baseCurrency = (template.currency ?? homeCurrency()).toUpperCase();
  const baseAmount = template.price_paise ?? 0;
  const baseEnabled = enabled.includes(baseCurrency);

  // Explicit prices for enabled currencies only. The base currency is left out:
  // `products.price_paise` is its single source of truth (so editing the product
  // price can never disagree with a stale product_prices row).
  const explicit = new Map<string, number>();
  for (const row of template.prices ?? []) {
    if (!row) continue;
    const code = row.currency?.toUpperCase();
    if (!code || row.active === false) continue;
    if (code === baseCurrency || !enabled.includes(code)) continue;
    explicit.set(code, row.amount_minor);
  }

  const wanted = requestedCurrency.toUpperCase();

  // Base-currency request: the product's own price is authoritative.
  if (wanted === baseCurrency && baseEnabled) {
    return { amountMinor: baseAmount, currency: baseCurrency };
  }

  // Normal path: an explicit price in the visitor's currency.
  if (explicit.has(wanted)) {
    return { amountMinor: explicit.get(wanted)!, currency: wanted };
  }

  // International visitor with no price in their currency: quote the
  // international default, then any other enabled price, then the home market --
  // a visitor is never left without a quote.
  if (explicit.has(INTERNATIONAL_DEFAULT_CURRENCY)) {
    return { amountMinor: explicit.get(INTERNATIONAL_DEFAULT_CURRENCY)!, currency: INTERNATIONAL_DEFAULT_CURRENCY };
  }
  for (const code of enabled) {
    if (explicit.has(code)) {
      return { amountMinor: explicit.get(code)!, currency: code };
    }
  }

  return baseEnabled
    ? { amountMinor: baseAmount, currency: baseCurrency }
    : { amountMinor: baseAmount, currency: enabled[0] ?? homeCurrency() };
}

/**
 * Loads a product's base price and explicit per-currency prices, then resolves
 * the quote. Throws when the product is unavailable so checkout fails closed.
 */
export async function resolveProductQuote(productId: string, requestedCurrency: string): Promise<PriceQuote> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, price_paise, currency, active, prices:product_prices(currency, amount_minor, active)")
    .eq("id", productId)
    .eq("active", true)
    .single();

  if (error || !data) {
    throw new Error("Product unavailable");
  }

  return quoteFor(
    {
      price_paise: data.price_paise,
      currency: data.currency,
      prices: (data as unknown as { prices?: Array<CurrencyPrice | null> | null }).prices,
    },
    requestedCurrency
  );
}

export interface TemplateQuote {
  quote: PriceQuote;
  /** Localised display string, e.g. "₹1,499" / "$19". */
  label: string;
  /** True when the template costs something (i.e. not a free preview). */
  payable: boolean;
}

/** Convenience wrapper for listing surfaces: resolve + format in one step. */
export function quoteForTemplate(template: TemplatePricingInput, currency: string): TemplateQuote {
  const quote = quoteFor(template, currency);
  return {
    quote,
    label: formatCurrency(quote.amountMinor, quote.currency),
    payable: quote.amountMinor > 0,
  };
}
