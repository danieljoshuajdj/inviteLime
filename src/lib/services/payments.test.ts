import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/services/payments";

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

beforeAll(() => {
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterAll(() => {
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

describe("verifyPaymentSignature", () => {
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";

  it("accepts the checkout signature Razorpay produces", () => {
    const signature = createHmac("sha256", KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    expect(
      verifyPaymentSignature({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
    ).toBe(true);
  });

  it("rejects a tampered signature", () => {
    expect(
      verifyPaymentSignature({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: "deadbeef",
      })
    ).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  /**
   * Razorpay's documented scheme: the hex digest of HMAC-SHA256 over the raw
   * request body, keyed with the webhook secret, sent in X-Razorpay-Signature.
   * See https://razorpay.com/docs/webhooks/validate-test — there is no
   * timestamp in the signed material, so replay is the handler's problem.
   */
  const digest = (body: string) => createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

  it("accepts the signature Razorpay produces over the raw body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, digest(body))).toBe(true);
  });

  it("accepts the same signature behind Razorpay's v1= scheme prefix", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, `v1=${digest(body)}`)).toBe(true);
  });

  it("rejects a body that does not match the signature", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(`${body} `, digest(body))).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    const body = "{}";
    expect(verifyWebhookSignature(body, digest(body).slice(0, 10))).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyWebhookSignature("{}", "")).toBe(false);
  });

  it("rejects everything when the webhook secret is unset", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = digest(body);
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      expect(verifyWebhookSignature(body, signature)).toBe(false);
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    }
  });

  it("does not fall back to the API key secret, which is a different key", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const withKeySecret = createHmac("sha256", KEY_SECRET).update(body).digest("hex");
    expect(verifyWebhookSignature(body, withKeySecret)).toBe(false);
  });
});
