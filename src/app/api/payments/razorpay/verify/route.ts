import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyPaymentSignature,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
} from "@/lib/services/payments";
import { invitationUrl } from "@/lib/services/weddings";
import { finalizePaidWedding } from "@/lib/services/finalize-purchase";
import { jsonError, readBody } from "@/lib/services/helpers";

const verifySchema = z.object({
  wedding_id: z.string().uuid(),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const dynamic = "force-dynamic";

/**
 * Called by the browser right after a successful checkout. Server-side
 * signature verification + price reconciliation happens here; the client is
 * never trusted with the payable amount.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid verification payload");

  const ok = verifyPaymentSignature({
    razorpay_order_id: parsed.data.razorpay_order_id,
    razorpay_payment_id: parsed.data.razorpay_payment_id,
    razorpay_signature: parsed.data.razorpay_signature,
  });
  if (!ok) return jsonError(403, "Invalid payment signature");

  const supabase = createAdminClient();

  // Guard: is this wedding already published? (idempotent re-submit)
  const { data: existing, error: existingError } = await supabase
    .from("weddings")
    .select("id, slug, status, template_id, template_version_id, bride_name, groom_name, wedding_date, email")
    .eq("id", parsed.data.wedding_id)
    .single();
  if (existingError || !existing) return jsonError(404, "Wedding not found");

  if (existing.status === "active") {
    if (!existing.slug) return jsonError(409, "Published wedding has no live link");
    return Response.json({
      published: true,
      url: invitationUrl(existing.slug),
      wedding: existing,
    });
  }

  // A checkout may find its draft detached because the template was deleted.
  if (!existing.template_id) {
    return jsonError(409, "This template is no longer available for checkout");
  }

  // Reconcile against the platform's own order row: it records what this
  // customer was asked to pay and in which currency. The Razorpay response is
  // only accepted when it agrees with that record, so a replayed or tampered
  // callback can never unlock a cheaper currency or a lower amount.
  const { data: orderRow, error: orderRowError } = await supabase
    .from("orders")
    .select("id, wedding_id, amount_paise, currency, status")
    .eq("provider_order_id", parsed.data.razorpay_order_id)
    .maybeSingle();
  if (orderRowError) return jsonError(500, "Could not load the order");
  if (!orderRow) return jsonError(409, "Unknown order");
  if (orderRow.wedding_id && orderRow.wedding_id !== existing.id) {
    return jsonError(409, "Order does not belong to this invitation");
  }

  const [order, payment] = await Promise.all([
    fetchRazorpayOrder(parsed.data.razorpay_order_id),
    fetchRazorpayPayment(parsed.data.razorpay_payment_id),
  ]);

  if (order.status !== "paid" && payment.status !== "captured") {
    return jsonError(402, "Payment not captured yet");
  }

  const expectedAmount = Number(orderRow.amount_paise);
  const paidAmount = Number(order.amount ?? payment.amount ?? 0);
  if (paidAmount !== expectedAmount) {
    return jsonError(409, "Paid amount does not match the order");
  }

  // A matching number in the wrong currency is still the wrong payment.
  const expectedCurrency = (orderRow.currency || "").toUpperCase();
  const paidCurrency = String(order.currency ?? payment.currency ?? "").toUpperCase();
  if (expectedCurrency && paidCurrency && paidCurrency !== expectedCurrency) {
    return jsonError(409, "Paid currency does not match the order");
  }

  await supabase
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", orderRow.id);

  // This endpoint is browser-driven and can be replayed or double-submitted.
  // The partial unique index on razorpay_payment_id makes a duplicate row
  // impossible; a 23505 only means another delivery already recorded it.
  const { error: paymentInsertError } = await supabase.from("payments").insert({
    wedding_id: existing.id,
    order_id: orderRow.id,
    razorpay_order_id: parsed.data.razorpay_order_id,
    razorpay_payment_id: parsed.data.razorpay_payment_id,
    provider: "razorpay",
    amount_paise: expectedAmount,
    currency: orderRow.currency,
    status: "captured",
    paid_at: new Date().toISOString(),
  });
  if (paymentInsertError && paymentInsertError.code !== "23505") {
    console.error("[payments] verify could not record payment", {
      weddingId: existing.id,
      code: paymentInsertError.code,
    });
    return jsonError(500, "Could not record payment");
  }

  const { published } = await finalizePaidWedding({
    weddingId: existing.id,
    pricePaise: expectedAmount,
    currency: orderRow.currency,
    source: "verify",
  });

  return Response.json({
    published: true,
    url: invitationUrl(published.slug),
    wedding: { ...existing, ...published },
    price: { price_paise: expectedAmount, currency: orderRow.currency },
  });
}