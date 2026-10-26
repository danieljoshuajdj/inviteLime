import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, readBody, requireUser } from "@/lib/services/helpers";
import { getLatestPlannerSubscription, getPlannerPlan } from "@/lib/services/planner-plans";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  razorpayConfigured,
} from "@/lib/services/payments";
import { addMonths } from "@/lib/utils";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(["monthly", "yearly"]),
});

/**
 * Starts a self-serve Razorpay subscription checkout.
 *
 * The local subscription is deliberately `pending` until the signature verify
 * or webhook proves the mandate was authorised. Pending rows do not consume an
 * invitation slot and are not treated as entitlements.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const session = await requireUser(supabase);
    if (session.profile?.status !== "active") return jsonError(403, "This account is not active");

    if (!razorpayConfigured()) {
      return jsonError(
        503,
        "Self-serve planner billing is not configured yet. Contact the studio to have a plan assigned."
      );
    }

    const parsed = bodySchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Choose a plan and billing cycle", parsed.error.flatten());

    const plan = await getPlannerPlan(parsed.data.planId);
    if (!plan || !plan.active) return jsonError(404, "That planner plan is not available");

    const providerPlanId =
      parsed.data.billingCycle === "monthly"
        ? plan.razorpay_monthly_plan_id
        : plan.razorpay_yearly_plan_id;
    if (!providerPlanId) {
      return jsonError(
        503,
        "This plan is not connected to Razorpay yet. Contact the studio to have a plan assigned."
      );
    }

    const admin = createAdminClient();
    const existing = await getLatestPlannerSubscription(session.user.id);
    if (
      existing &&
      existing.status === "active" &&
      new Date(existing.current_period_end).getTime() > Date.now()
    ) {
      return jsonError(409, "You already have an active Planner Plan. Manage it before subscribing again.");
    }

    if (existing) {
      if (existing.status === "active" || existing.status === "past_due") {
        // A row whose period has ended still occupies the one-live-plan unique
        // index. Stop any provider retry/renewal and expire it before starting
        // the replacement checkout.
        if (existing.source === "razorpay" && existing.provider_subscription_id) {
          await cancelRazorpaySubscription(existing.provider_subscription_id, false).catch((err) => {
            console.warn("[planner] could not cancel lapsed subscription", err);
          });
        }
        await admin
          .from("planner_subscriptions")
          .update({ status: "expired" })
          .eq("id", existing.id);
      } else if (existing.status === "pending") {
        // Abandoned checkouts must not later activate over the new plan.
        if (existing.source === "razorpay" && existing.provider_subscription_id) {
          await cancelRazorpaySubscription(existing.provider_subscription_id, false).catch((err) => {
            console.warn("[planner] could not cancel abandoned checkout", err);
          });
        }
        await admin
          .from("planner_subscriptions")
          .update({ status: "cancelled" })
          .eq("id", existing.id);
      }
    }

    const start = new Date();
    // The provisional period is replaced by Razorpay's authoritative dates as
    // soon as the mandate is authorised.
    const end = addMonths(start, parsed.data.billingCycle === "yearly" ? 12 : 1);

    const { data: pending, error: insertError } = await admin
      .from("planner_subscriptions")
      .insert({
        profile_id: session.user.id,
        plan_id: plan.id,
        billing_cycle: parsed.data.billingCycle,
        status: "pending",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
        source: "razorpay",
        notes: `Self-serve ${parsed.data.billingCycle} subscription`,
      })
      .select("id")
      .single();
    if (insertError || !pending) return jsonError(500, "Could not start planner checkout");

    let provider;
    try {
      provider = await createRazorpaySubscription({
        providerPlanId,
        billingCycle: parsed.data.billingCycle,
        notes: {
          profile_id: session.user.id,
          local_subscription_id: pending.id,
          plan_id: plan.id,
          billing_cycle: parsed.data.billingCycle,
        },
      });
    } catch (e) {
      await admin.from("planner_subscriptions").delete().eq("id", pending.id);
      return jsonError(502, e instanceof Error ? e.message : "Razorpay subscription could not be created");
    }

    const providerId = (provider as { id?: string }).id;
    if (!providerId) {
      await admin.from("planner_subscriptions").delete().eq("id", pending.id);
      return jsonError(502, "Razorpay returned no subscription id");
    }

    const { error: providerError } = await admin
      .from("planner_subscriptions")
      .update({ provider_subscription_id: providerId })
      .eq("id", pending.id);
    if (providerError) {
      // Do not leave a live provider mandate that no local row points at.
      await cancelRazorpaySubscription(providerId, false).catch((err) => {
        console.warn("[planner] could not cancel unlinked provider subscription", err);
      });
      await admin.from("planner_subscriptions").delete().eq("id", pending.id);
      return jsonError(500, "Could not link the Razorpay subscription");
    }

    return Response.json({
      localSubscriptionId: pending.id,
      subscriptionId: providerId,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "",
      plan: { id: plan.id, name: plan.name, slug: plan.slug },
      billingCycle: parsed.data.billingCycle,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "AUTH_REQUIRED") return jsonError(401, "Sign in required");
    return jsonError(500, e instanceof Error ? e.message : "Could not start planner checkout");
  }
}
