import { createHmac, timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Razorpay is loaded lazily so the SDK (which reads server secrets) is never
 * bundled into client code. Requires RAZORPAY_KEY_SECRET in the env.
 */
async function razorpayClient() {
  // The public key id is also accepted so a single env var can serve both the
  // checkout widget and the server SDK.
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret || keySecret.startsWith("placeholder")) {
    throw new Error("RAZORPAY credentials are not configured on the server.");
  }

  const { default: Razorpay } = await import("razorpay");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export interface CreateOrderInput {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export async function createRazorpayOrder(input: CreateOrderInput) {
  const client = await razorpayClient();
  return client.orders.create({
    amount: input.amountPaise, // paise
    currency: input.currency,
    receipt: input.receipt,
    notes: input.notes ?? {},
  });
}

export async function fetchRazorpayOrder(orderId: string) {
  const client = await razorpayClient();
  return client.orders.fetch(orderId);
}

export async function fetchRazorpayPayment(paymentId: string) {
  const client = await razorpayClient();
  return client.payments.fetch(paymentId);
}

/** Verify the signature of a checkout callback (client-side success claim). */
export function verifyPaymentSignature(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  const generated = createHmac("sha256", secret)
    .update(`${payload.razorpay_order_id}|${payload.razorpay_payment_id}`)
    .digest("hex");
  return generated === payload.razorpay_signature;
}

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the raw request body with the webhook secret and sends the hex
 * digest in `X-Razorpay-Signature`:
 *
 *   expected = hmac_sha256(webhook_secret, raw_request_body)
 *
 * There is no timestamp in this scheme, so replays are handled by keeping the
 * handler idempotent rather than by a time window. The body must be the
 * untouched bytes — re-serialising parsed JSON reorders keys and breaks the
 * digest. The webhook secret is distinct from the API key secret and is not
 * interchangeable with it, so there is deliberately no fallback to
 * RAZORPAY_KEY_SECRET: that would only ever produce a mismatch.
 */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  // Some SDK surfaces expose the header with Razorpay's "v1=" scheme prefix.
  const provided = signature.startsWith("v1=") ? signature.slice(3) : signature;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Server-side source of truth for the payable amount. Never accept a price
 * from the browser.
 */
export async function getServerPricing(productId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price_paise, currency, active")
    .eq("id", productId)
    .eq("active", true)
    .single();

  if (error || !data) {
    throw new Error("Product unavailable");
  }
  return data;
}
// ── Planner subscriptions ─────────────────────────────────────────────
// One-time invitation payments use orders; recurring planner plans use
// Razorpay Subscriptions. Keeping the two flows separate avoids inventing a
// fake one-time payment row for a plan-covered invitation.

export function razorpayConfigured(): boolean {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(keyId && keySecret && !keySecret.startsWith("placeholder"));
}

export async function createRazorpaySubscription(input: {
  providerPlanId: string;
  billingCycle: "monthly" | "yearly";
  notes?: Record<string, string>;
}) {
  const client = await razorpayClient();
  return client.subscriptions.create({
    plan_id: input.providerPlanId,
    // Razorpay requires a finite cycle count. Renewal remains automatic until
    // this cap; a ten-year yearly cap is effectively "ongoing" for our use.
    total_count: input.billingCycle === "yearly" ? 10 : 120,
    quantity: 1,
    customer_notify: 1,
    notes: input.notes ?? {},
  });
}

export async function fetchRazorpaySubscription(subscriptionId: string) {
  const client = await razorpayClient();
  return client.subscriptions.fetch(subscriptionId);
}

export async function cancelRazorpaySubscription(
  subscriptionId: string,
  cancelAtCycleEnd = true
) {
  const client = await razorpayClient();
  return client.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

/** Razorpay subscription checkout signature is `payment_id|subscription_id`. */
export function verifySubscriptionSignature(payload: {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const generated = createHmac("sha256", secret)
    .update(`${payload.razorpay_payment_id}|${payload.razorpay_subscription_id}`)
    .digest("hex");
  const a = Buffer.from(generated, "utf8");
  const b = Buffer.from(payload.razorpay_signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
