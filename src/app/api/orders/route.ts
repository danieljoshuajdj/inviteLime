import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getGuestDraft } from "@/lib/services/guest";
import { createRazorpayOrder } from "@/lib/services/payments";
import { createDraftWedding, invitationUrl } from "@/lib/services/weddings";
import { guestTokenFromCookies, type GuestDraft } from "@/lib/services/guest";
import { getCurrentProfile, jsonError, readBody } from "@/lib/services/helpers";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";
import { currencyFromRequest } from "@/lib/services/geo";
import { quoteFor, type TemplatePricingInput } from "@/lib/services/pricing";
import {
  claimPlannerInvitationSlot,
  getPlannerEntitlement,
  releasePlannerInvitationSlot,
} from "@/lib/services/planner-plans";
import { getPlannerBrand, isPlannerBrandComplete } from "@/lib/services/planner-branding";
import { finalizePaidWedding } from "@/lib/services/finalize-purchase";

const bodySchema = z.object({
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid(),
  brideName: z.string().min(1).max(120),
  groomName: z.string().min(1).max(120),
  weddingDate: z.string().min(1),
  email: z.string().email().optional().nullable(),
  // Guest session token. Optional because the httpOnly cookie is the normal
  // path; the explicit field covers fetch clients without cookies.
  token: z.string().min(10).optional(),
});

export const dynamic = "force-dynamic";

/**
 * Creates the draft wedding + a Razorpay order. The guest token (from an
 * httpOnly cookie, or the Authorization header / body for fetch clients)
 * authorizes the draft ownership.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid order payload", parsed.error.flatten());
    }

    const cookieToken = guestTokenFromCookies(req.headers.get("cookie"));
    const authToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const token = parsed.data.token ?? cookieToken ?? authToken;

    if (!token) return jsonError(401, "Guest session required");

    const limit = await consumeRateLimit({
      bucket: "order_create",
      key: clientKey(req),
      limit: 10,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many checkout attempts. Please try again later.");
    }

    const supabase = createAdminClient();
    const draft = await getGuestDraft(supabase, token);
    if (!draft) return jsonError(404, "Draft not found for this session");

    // A planner draft may only be checked out by the planner who owns it. This
    // prevents a leaked guest cookie from spending another studio's slots or
    // stamping their brand on someone else's invitation.
    const plannerId = draft.planner_id;
    let plannerSubscriptionId: string | null = null;
    let coveredByPlan = false;
    let claimedSlot = false;

    if (plannerId) {
      const authClient = await createServerClient();
      const session = await getCurrentProfile(authClient);
      if (!session || session.user.id !== plannerId) {
        return jsonError(403, "Sign in as the planner account that started this invitation.");
      }

      const entitlement = await getPlannerEntitlement(plannerId, { client: supabase });
      const brand = await getPlannerBrand(plannerId, supabase);

      // A plan covers the invitation only when it is live, has a slot left and
      // the studio has a usable brand. Otherwise this falls through to the
      // normal one-time purchase, without branding or plan benefits. That
      // keeps a lapsed planner able to deliver for a couple as a customer.
      if (entitlement.active && entitlement.canCreate && entitlement.subscription && isPlannerBrandComplete(brand)) {
        plannerSubscriptionId = entitlement.subscription.id;
        coveredByPlan = true;
      }
    }

    const templateVersion = await supabase
      .from("template_versions")
      .select("template_id, status")
      .eq("id", parsed.data.templateVersionId)
      .eq("status", "published")
      .single();
    if (templateVersion.error || templateVersion.data?.template_id !== parsed.data.templateId) {
      return jsonError(400, "Template version mismatch");
    }

    const product = await supabase
      .from("templates")
      .select("product_id, status")
      .eq("id", parsed.data.templateId)
      .eq("status", "active")
      .single();
    if (product.error || !product.data?.product_id) {
      return jsonError(400, "This template is no longer available for purchase");
    }

    const productRow = await supabase
      .from("products")
      .select("id, name, price_paise, currency, prices:product_prices(currency, amount_minor, active)")
      .eq("id", product.data.product_id)
      .single();
    if (productRow.error || !productRow.data) return jsonError(400, "Pricing unavailable");

    // The currency is resolved from the request's trusted geo headers and
    // clamped to the operator's allow-list; the amount comes from the
    // server-side price table. Neither the price nor the currency is ever
    // taken from the request body.
    const quote = quoteFor(
      productRow.data as unknown as TemplatePricingInput,
      currencyFromRequest(req)
    );

    if (coveredByPlan && plannerId && plannerSubscriptionId) {
      // Reserve before inserting. The DB function locks the subscription row,
      // making the final-slot check safe across concurrent tabs.
      claimedSlot = await claimPlannerInvitationSlot(plannerSubscriptionId, plannerId);
      if (!claimedSlot) {
        return jsonError(
          409,
          "This Planner Plan has reached its invitation limit. Upgrade or renew to publish another invitation."
        );
      }
    }

    let wedding: { id: string; slug: string };
    try {
      wedding = await createDraftWedding({
        templateId: parsed.data.templateId,
        templateVersionId: parsed.data.templateVersionId,
        brideName: parsed.data.brideName,
        groomName: parsed.data.groomName,
        weddingDate: parsed.data.weddingDate,
        guestSessionId: (draft as GuestDraft).session_id,
        email: parsed.data.email ?? null,
        weddingData: (draft as GuestDraft).wedding_data as Record<string, unknown>,
        productId: productRow.data.id,
        userId: plannerId,
        plannerId: coveredByPlan ? plannerId : null,
        plannerSubscriptionId,
        billingSource: coveredByPlan ? "planner_plan" : "one_time",
      });
    } catch (err) {
      if (claimedSlot && plannerSubscriptionId) {
        await releasePlannerInvitationSlot(plannerSubscriptionId);
      }
      throw err;
    }

    if (coveredByPlan && plannerId && plannerSubscriptionId) {
      const subscriptionId = plannerSubscriptionId;
      // No Razorpay order and no payment row: the plan is the entitlement. The
      // zero-value order still gives reconciliation and the success page a
      // single order-shaped record to read.
      const { data: planOrder, error: planOrderError } = await supabase
        .from("orders")
        .insert({
          user_id: plannerId,
          guest_session_id: (draft as GuestDraft).session_id,
          draft_id: (draft as GuestDraft).id,
          wedding_id: wedding.id,
          template_id: parsed.data.templateId,
          template_version_id: parsed.data.templateVersionId,
          product_id: productRow.data.id,
          amount_paise: 0,
          currency: quote.currency,
          provider: "planner_plan",
          provider_order_id: null,
          planner_subscription_id: subscriptionId,
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (planOrderError || !planOrder) {
        await releasePlannerInvitationSlot(subscriptionId);
        await supabase.from("weddings").update({ status: "cancelled" }).eq("id", wedding.id);
        return jsonError(500, "Could not record the plan-covered publish. Please try again.");
      }

      try {
        const finalized = await finalizePaidWedding({
          weddingId: wedding.id,
          pricePaise: 0,
          currency: quote.currency,
          source: "planner_plan",
        });
        return Response.json({
          coveredByPlan: true,
          wedding,
          orderId: planOrder.id,
          url: invitationUrl(finalized.published.slug),
          amountPaise: 0,
          currency: quote.currency,
        });
      } catch (err) {
        // publishWedding may have gone live before a later finalize step failed.
        // Never tear down a delivered invitation (and burn the planner's slot)
        // in that case; the plan-covered order is already recorded as paid.
        const { data: afterFailure } = await supabase
          .from("weddings")
          .select("status, slug")
          .eq("id", wedding.id)
          .maybeSingle();
        if (afterFailure?.status === "active") {
          console.error("[orders] plan publish finalized with a non-fatal error", err);
          return Response.json({
            coveredByPlan: true,
            wedding: { id: wedding.id, slug: afterFailure.slug ?? wedding.slug },
            orderId: planOrder.id,
            url: invitationUrl(afterFailure.slug ?? wedding.slug),
            amountPaise: 0,
            currency: quote.currency,
          });
        }
        await releasePlannerInvitationSlot(subscriptionId);
        await supabase.from("orders").update({ status: "failed" }).eq("id", planOrder.id);
        await supabase.from("weddings").update({ status: "cancelled" }).eq("id", wedding.id);
        throw err;
      }
    }

    const order = await createRazorpayOrder({
      amountPaise: quote.amountMinor,
      currency: quote.currency,
      receipt: `inv_${wedding.id.slice(0, 12)}`,
      notes: {
        wedding_id: wedding.id,
        template_id: parsed.data.templateId,
        product_name: productRow.data.name,
        currency: quote.currency,
      },
    });

    // Record the order for reconciliation. If this fails the webhook will have
    // no server-side record of what was owed, so the customer must not be sent
    // to Razorpay -- fail loudly instead of silently losing the linkage.
    const { error: orderError } = await supabase.from("orders").insert({
      user_id: null,
      guest_session_id: (draft as GuestDraft).session_id,
      draft_id: (draft as GuestDraft).id,
      wedding_id: wedding.id,
      template_id: parsed.data.templateId,
      template_version_id: parsed.data.templateVersionId,
      product_id: productRow.data.id,
      amount_paise: quote.amountMinor,
      currency: quote.currency,
      provider: "razorpay",
      provider_order_id: order.id,
      status: "pending",
    });
    if (orderError) {
      console.error("[orders] could not record order for reconciliation", {
        razorpayOrderId: order.id,
        weddingId: wedding.id,
        code: orderError.code,
      });
      return jsonError(500, "Could not start checkout. Please try again.");
    }

    return Response.json({
      wedding,
      orderId: order.id,
      amountPaise: quote.amountMinor,
      currency: quote.currency,
    });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not create order");
  }
}