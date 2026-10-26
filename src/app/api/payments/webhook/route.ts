import { createAdminClient } from "@/lib/supabase/admin";
import { publishWedding, invitationUrl } from "@/lib/services/weddings";
import { sendEmail, renderInvitationPublishedEmail } from "@/lib/services/email";
import { recordEvent } from "@/lib/services/analytics";
import { linkInvitationToCustomer } from "@/lib/services/account-linking";
import { verifyWebhookSignature } from "@/lib/services/payments";
import { applyProviderSubscriptionState, unixToIso } from "@/lib/services/planner-plans";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook — authoritative confirmation of payment.
 * Signature verified against the raw body before trusting anything.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // A missing webhook secret is a deployment fault, not a bad request. It is
  // reported as such instead of surfacing as a wall of 403s.
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  if (!verifyWebhookSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 403 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          order_id?: string;
          id?: string;
          amount?: number;
          currency?: string;
          status?: string;
          notes?: Record<string, string>;
        };
      };
      subscription?: {
        entity?: {
          id?: string;
          status?: string;
          current_start?: number | null;
          current_end?: number | null;
          cancel_at_cycle_end?: boolean;
        };
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid webhook body" }, { status: 400 });
  }

  // Planner subscription lifecycle. These are separate from one-time invitation
  // orders and are acknowledged even when the local row is unknown (for example
  // a webhook from a staging Razorpay account).
  const subscriptionEvents = new Set([
    "subscription.activated",
    "subscription.authenticated",
    "subscription.charged",
    "subscription.cancelled",
    "subscription.halted",
    "subscription.paused",
    "subscription.resumed",
    "subscription.completed",
    "subscription.expired",
  ]);
  if (event.event && subscriptionEvents.has(event.event)) {
    const entity = event.payload?.subscription?.entity;
    if (!entity?.id) return Response.json({ error: "Missing subscription entity" }, { status: 400 });

    const mappedStatus =
      event.event === "subscription.paused"
        ? "paused"
        : event.event === "subscription.resumed"
          ? "active"
          : event.event === "subscription.halted"
            ? "halted"
            : event.event === "subscription.completed"
              ? "completed"
              : event.event === "subscription.expired"
                ? "expired"
                : event.event === "subscription.cancelled"
                  ? "cancelled"
                  : entity.status ?? "active";

    await applyProviderSubscriptionState({
      providerSubscriptionId: entity.id,
      status: mappedStatus,
      currentStart: unixToIso(entity.current_start),
      currentEnd: unixToIso(entity.current_end),
      cancelAtCycleEnd: entity.cancel_at_cycle_end,
    }).catch((err) => {
      console.error("[payments] could not apply subscription state", err);
    });
    return Response.json({ ack: true });
  }

  if (event.event === "payment.failed") {
    // Record the failure so finance/reconciliation can see it, then ack.
    const failed = event.payload?.payment?.entity;
    if (failed?.order_id) {
      await createAdminClient()
        .from("orders")
        .update({ status: "failed" })
        .eq("provider_order_id", failed.order_id)
        .eq("status", "pending");
    }
    return Response.json({ ack: true });
  }

  if (event.event !== "payment.captured") {
    // Events we don't handle are acknowledged so Razorpay stops retrying.
    return Response.json({ ack: true });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment || !payment.order_id || payment.status !== "captured") {
    return Response.json({ error: "Missing payment entity" }, { status: 400 });
  }

  // Without a provider payment id there is nothing to deduplicate on, so the
  // delivery cannot be recognised as a replay.
  const paymentId = payment.id;
  if (!paymentId) {
    return Response.json({ error: "Missing payment id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Reconcile against the order row: it is the platform's own record of what
  // the customer was asked to pay. If it is missing there is nothing to
  // reconcile against, so the payment cannot be trusted -- previously this
  // skipped the amount check entirely and published whatever the notes claimed.
  const { data: orderRow } = await supabase
    .from("orders")
    .select("id, wedding_id, amount_paise, currency, status")
    .eq("provider_order_id", payment.order_id)
    .maybeSingle();

  if (!orderRow) {
    console.error("[payments] webhook for an unknown order", { orderId: payment.order_id });
    return Response.json({ error: "Unknown order" }, { status: 409 });
  }

  if (Number(payment.amount ?? 0) !== Number(orderRow.amount_paise)) {
    console.error("[payments] webhook amount mismatch", {
      orderId: orderRow.id,
      expected: orderRow.amount_paise,
      received: payment.amount,
    });
    return Response.json({ error: "Amount mismatch" }, { status: 409 });
  }

  // A matching number in the wrong currency is still the wrong payment.
  if (orderRow.currency && payment.currency && payment.currency !== orderRow.currency) {
    console.error("[payments] webhook currency mismatch", {
      orderId: orderRow.id,
      expected: orderRow.currency,
      received: payment.currency,
    });
    return Response.json({ error: "Currency mismatch" }, { status: 409 });
  }

  // The order row is authoritative. `notes` come from the payment payload, so
  // they are only accepted when they agree with it.
  const notes = (payment.notes ?? {}) as Record<string, string>;
  const notedWeddingId = notes.wedding_id ?? null;
  if (notedWeddingId && orderRow.wedding_id && notedWeddingId !== orderRow.wedding_id) {
    console.error("[payments] webhook wedding mismatch", {
      orderId: orderRow.id,
      orderWeddingId: orderRow.wedding_id,
      notedWeddingId,
    });
    return Response.json({ error: "Wedding mismatch" }, { status: 409 });
  }

  const weddingId = orderRow.wedding_id ?? notedWeddingId;
  if (!weddingId) {
    return Response.json({ error: "No wedding mapped to order" }, { status: 404 });
  }

  // Idempotent: a replayed webhook must not create duplicate payments. The
  // partial unique index on payments(razorpay_payment_id) is the real guard for
  // overlapping deliveries; this check just avoids the work in the common case.
  const { data: dup } = await supabase
    .from("payments")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();
  if (!dup) {
    await supabase
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderRow.id);

    // A unique-violation here means a concurrent delivery already recorded
    // this payment, which is the outcome we wanted.
    const { error: insertError } = await supabase.from("payments").insert({
      wedding_id: weddingId,
      order_id: orderRow.id,
      razorpay_order_id: payment.order_id,
      razorpay_payment_id: paymentId,
      provider: "razorpay",
      amount_paise: Number(payment.amount ?? orderRow.amount_paise),
      currency: payment.currency ?? orderRow.currency,
      status: "captured",
      paid_at: new Date().toISOString(),
    });
    if (insertError && insertError.code !== "23505") {
      console.error("[payments] could not record payment", {
        orderId: orderRow.id,
        code: insertError.code,
      });
      return Response.json({ error: "Could not record payment" }, { status: 500 });
    }
  }

  const published = await publishWedding(weddingId).catch(() => null);
  if (!published) {
    return Response.json({ error: "Could not publish wedding" }, { status: 500 });
  }

  void recordEvent("wedding_published", { wedding_id: weddingId, source: "webhook" });

  // Attach the invitation to the buyer's account and email the access link.
  void linkInvitationToCustomer(weddingId).then((linked) => {
    if (!linked.linked) {
      console.warn("[payments] account linking skipped", { weddingId, reason: linked.reason });
    }
  });

  if (published.email) {
    void sendEmail(
      {
        to: published.email,
        ...renderInvitationPublishedEmail({
          coupleNames: `${published.groom_name ?? "—"} & ${published.bride_name ?? "—"}`,
          weddingDate: published.wedding_date ?? "",
          invitationUrl: invitationUrl(published.slug),
          expirationDate: published.expiration_date ?? "",
          appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000/app/explore",
        }),
        templateKey: "invitation_published",
        weddingId,
      },
      { dedupe: true }
    ).catch(() => {});
  }

  return Response.json({ ack: true });
}