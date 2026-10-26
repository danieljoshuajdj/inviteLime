import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, requireUser } from "@/lib/services/helpers";
import { getLatestPlannerSubscription } from "@/lib/services/planner-plans";
import { cancelRazorpaySubscription } from "@/lib/services/payments";

export const dynamic = "force-dynamic";

/**
 * Requests cancellation at the end of the paid period. The planner keeps
 * access until current_period_end; the public invitations are never touched.
 */
export async function POST() {
  try {
    const supabase = await createServerClient();
    const session = await requireUser(supabase);
    const current = await getLatestPlannerSubscription(session.user.id);
    if (!current) return jsonError(404, "No Planner Plan to cancel");
    if (current.status !== "active") return jsonError(409, "This Planner Plan is not active");
    if (current.source !== "razorpay" || !current.provider_subscription_id) {
      return jsonError(403, "Studio-assigned plans are managed by the studio. Contact support to cancel.");
    }

    await cancelRazorpaySubscription(current.provider_subscription_id, true);
    const admin = createAdminClient();
    const { error } = await admin
      .from("planner_subscriptions")
      .update({
        cancel_at_period_end: true,
        cancellation_requested_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (error) return jsonError(500, "Could not schedule cancellation");

    return Response.json({ ok: true, endsAt: current.current_period_end });
  } catch (e) {
    if (e instanceof Error && e.message === "AUTH_REQUIRED") return jsonError(401, "Sign in required");
    return jsonError(500, e instanceof Error ? e.message : "Could not cancel Planner Plan");
  }
}
