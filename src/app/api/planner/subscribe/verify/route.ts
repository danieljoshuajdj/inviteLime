import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, readBody, requireUser } from "@/lib/services/helpers";
import {
  fetchRazorpaySubscription,
  verifySubscriptionSignature,
} from "@/lib/services/payments";
import { refreshPlannerRole } from "@/lib/services/planner-plans";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  razorpay_payment_id: z.string().min(3),
  razorpay_subscription_id: z.string().min(3),
  razorpay_signature: z.string().min(10),
});

/** Signature-verified activation of a self-serve planner subscription. */
export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const session = await requireUser(supabase);
    const parsed = bodySchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid subscription confirmation");
    if (!verifySubscriptionSignature(parsed.data)) {
      return jsonError(400, "Subscription signature could not be verified");
    }

    const admin = createAdminClient();
    const { data: local } = await admin
      .from("planner_subscriptions")
      .select("id, profile_id, status, current_period_start, provider_subscription_id")
      .eq("provider_subscription_id", parsed.data.razorpay_subscription_id)
      .maybeSingle();
    if (!local || local.profile_id !== session.user.id) {
      return jsonError(404, "Subscription not found for this account");
    }
    if (local.status === "active") {
      // The webhook may have activated this checkout a moment before the
      // browser callback. Keep the retry idempotent.
      return Response.json({ ok: true });
    }
    if (local.status !== "pending") {
      // A verified payment body can be replayed. Never let it reopen a plan
      // that an admin cancelled or that was superseded by a newer checkout.
      return jsonError(409, "This subscription is no longer awaiting activation");
    }

    const provider = await fetchRazorpaySubscription(parsed.data.razorpay_subscription_id);
    const entity = provider as unknown as {
      status?: string;
      current_start?: number | null;
      current_end?: number | null;
    };
    const status = entity.status ?? "active";
    if (status !== "active" && status !== "authenticated") {
      return jsonError(409, `Razorpay subscription is ${status}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const start = entity.current_start ? new Date(entity.current_start * 1000) : new Date();
    const end = entity.current_end ? new Date(entity.current_end * 1000) : new Date((now + 31 * 86400) * 1000);
    const newPeriod = start.toISOString() !== local.current_period_start;

    // A lapsed row can still be marked active in the database. Retire any
    // other live row before activating this one or the unique live-plan index
    // would reject the update.
    await admin
      .from("planner_subscriptions")
      .update({ status: "expired" })
      .eq("profile_id", local.profile_id)
      .in("status", ["active", "past_due"])
      .neq("id", local.id);

    const { error } = await admin
      .from("planner_subscriptions")
      .update({
        status: "active",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
        ...(newPeriod ? { invitations_used: 0 } : {}),
      })
      .eq("id", local.id);
    if (error) return jsonError(500, "Could not activate the Planner Plan");

    await refreshPlannerRole(session.user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "AUTH_REQUIRED") return jsonError(401, "Sign in required");
    return jsonError(500, e instanceof Error ? e.message : "Could not verify planner subscription");
  }
}
