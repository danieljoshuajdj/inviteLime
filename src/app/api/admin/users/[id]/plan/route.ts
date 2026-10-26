import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import {
  assignPlannerPlan,
  getLatestPlannerSubscription,
  updatePlannerSubscriptionAdmin,
} from "@/lib/services/planner-plans";
import { cancelRazorpaySubscription } from "@/lib/services/payments";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["assign", "extend", "cancel", "reset_usage", "reactivate"]).default("assign"),
  planId: z.string().uuid().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  periodEnd: z.string().min(1).optional().nullable(),
  invitationLimitOverride: z.number().int().min(1).max(100_000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  subscriptionId: z.string().uuid().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid user id");
    const supabase = await createServerClient();
    await requireAdmin(supabase);
    return Response.json({ subscription: await getLatestPlannerSubscription(id) });
  } catch (e) {
    return adminApiError(e);
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid user id");
    const supabase = await createServerClient();
    const admin = await requireAdmin(supabase);
    const parsed = bodySchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid plan change", parsed.error.flatten());

    if (parsed.data.action === "assign") {
      if (!parsed.data.planId || !parsed.data.billingCycle) {
        return jsonError(400, "Choose a plan and billing cycle");
      }
      // Replacing a self-serve subscription must stop provider renewals too,
      // otherwise the planner could be charged for a plan that was replaced.
      // Cancel every open provider row, not just the latest: an abandoned
      // pending checkout can coexist with an active or freshly assigned plan.
      const providerClient = createAdminClient();
      const { data: openProviderRows } = await providerClient
        .from("planner_subscriptions")
        .select("id, provider_subscription_id")
        .eq("profile_id", id)
        .eq("source", "razorpay")
        .in("status", ["pending", "active", "past_due"])
        .not("provider_subscription_id", "is", null);
      for (const row of openProviderRows ?? []) {
        if (!row.provider_subscription_id) continue;
        await cancelRazorpaySubscription(row.provider_subscription_id, true).catch((err) => {
          console.warn("[admin] could not cancel replaced Razorpay subscription", err);
        });
      }
      const subscription = await assignPlannerPlan({
        profileId: id,
        planId: parsed.data.planId,
        billingCycle: parsed.data.billingCycle,
        periodEnd: parsed.data.periodEnd ?? null,
        invitationLimitOverride: parsed.data.invitationLimitOverride ?? null,
        notes: parsed.data.notes ?? null,
        createdBy: admin.user.id,
      });
      await logAdminAction(admin.user.id, "planner_plan.assign", "user", id, {
        planId: subscription.plan_id,
        billingCycle: subscription.billing_cycle,
        subscriptionId: subscription.id,
      });
      return Response.json({ subscription });
    }

    const current = await getLatestPlannerSubscription(id);
    if (!current) return jsonError(404, "This user has no planner plan");
    if (parsed.data.subscriptionId && current.id !== parsed.data.subscriptionId) {
      return jsonError(409, "That subscription is not the user's latest plan");
    }

    if (
      parsed.data.action === "cancel" &&
      current.source === "razorpay" &&
      current.provider_subscription_id
    ) {
      await cancelRazorpaySubscription(current.provider_subscription_id, false).catch((err) => {
        console.warn("[admin] could not cancel Razorpay subscription", err);
      });
    }

    const subscription = await updatePlannerSubscriptionAdmin({
      subscriptionId: current.id,
      action: parsed.data.action,
      periodEnd: parsed.data.periodEnd ?? null,
      invitationLimitOverride: parsed.data.invitationLimitOverride,
      notes: parsed.data.notes,
    });
    await logAdminAction(admin.user.id, `planner_plan.${parsed.data.action}`, "user", id, {
      subscriptionId: current.id,
    });
    return Response.json({ subscription });
  } catch (e) {
    return adminApiError(e);
  }
}
