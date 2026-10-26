import type { Database, Json, PlannerBillingCycle } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Supabase } from "@/lib/services/helpers";
import { addMonths } from "@/lib/utils";

export type PlannerPlanRow = Database["public"]["Tables"]["planner_plans"]["Row"];
type PlannerPlanUpdate = Database["public"]["Tables"]["planner_plans"]["Update"];
type PlannerSubscriptionUpdate = Database["public"]["Tables"]["planner_subscriptions"]["Update"];

export interface PlannerSubscriptionWithPlan {
  id: string;
  profile_id: string;
  plan_id: string;
  billing_cycle: PlannerBillingCycle;
  status: "pending" | "active" | "past_due" | "cancelled" | "expired";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancellation_requested_at: string | null;
  invitations_used: number;
  invitation_limit_override: number | null;
  source: "admin" | "razorpay";
  provider_subscription_id: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan: PlannerPlanRow;
}

export type PlannerEntitlementReason =
  | "ready"
  | "no_plan"
  | "expired"
  | "inactive"
  | "limit_reached";

export interface PlannerEntitlement {
  active: boolean;
  canCreate: boolean;
  reason: PlannerEntitlementReason;
  plan: PlannerPlanRow | null;
  subscription: PlannerSubscriptionWithPlan | null;
  /** NULL means unlimited. */
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface PlannerPlanInput {
  name: string;
  slug: string;
  description?: string | null;
  monthlyPricePaise: number;
  yearlyPricePaise: number;
  currency?: string;
  monthlyInvitationLimit?: number | null;
  yearlyInvitationLimit?: number | null;
  razorpayMonthlyPlanId?: string | null;
  razorpayYearlyPlanId?: string | null;
  active?: boolean;
}

function planRow(row: PlannerPlanRow): PlannerPlanRow {
  return row;
}

function withPlan(row: Record<string, unknown>): PlannerSubscriptionWithPlan {
  const { planner_plans, ...sub } = row;
  const planRows = Array.isArray(planner_plans)
    ? planner_plans
    : planner_plans
      ? [planner_plans]
      : [];
  return { ...(sub as unknown as PlannerSubscriptionWithPlan), plan: planRows[0] };
}

export async function listPlannerPlans(
  opts: { includeInactive?: boolean } = {},
  client: Supabase = createAdminClient()
): Promise<PlannerPlanRow[]> {
  let query = client.from("planner_plans").select("*").order("monthly_price_paise", { ascending: true });
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as PlannerPlanRow[];
}

export async function getPlannerPlan(planId: string, client: Supabase = createAdminClient()) {
  const { data, error } = await client.from("planner_plans").select("*").eq("id", planId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlannerPlanRow | null) ?? null;
}

export async function getPlannerPlanBySlug(slug: string, client: Supabase = createAdminClient()) {
  const { data, error } = await client.from("planner_plans").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlannerPlanRow | null) ?? null;
}

export async function getPlannerSubscription(
  subscriptionId: string,
  client: Supabase = createAdminClient()
): Promise<PlannerSubscriptionWithPlan | null> {
  const { data, error } = await client
    .from("planner_subscriptions")
    .select("*, planner_plans(*)")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return withPlan(data as never);
}

export async function getLatestPlannerSubscription(
  profileId: string,
  client: Supabase = createAdminClient()
): Promise<PlannerSubscriptionWithPlan | null> {
  const { data, error } = await client
    .from("planner_subscriptions")
    .select("*, planner_plans(*)")
    .eq("profile_id", profileId)
    .order("current_period_end", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  // An admin replacement can leave a cancelled annual row with a later end date
  // than the new monthly row. Prefer a live row, then an in-flight checkout,
  // then fall back to the latest historical row for display.
  const current =
    data.find((row) => row.status === "active" || row.status === "past_due") ??
    data.find((row) => row.status === "pending") ??
    data[0];
  return withPlan(current as never);
}

/**
 * Resolves a planner's live entitlement.
 *
 * Expiry is checked here and only here. Public invitations never consult the
 * planner subscription, so a lapsed plan cannot take a delivered invitation
 * offline.
 */
export async function getPlannerEntitlement(
  profileId: string,
  opts: { client?: Supabase; now?: Date } = {}
): Promise<PlannerEntitlement> {
  const subscription = await getLatestPlannerSubscription(profileId, opts.client);
  if (!subscription) {
    return {
      active: false,
      canCreate: false,
      reason: "no_plan",
      plan: null,
      subscription: null,
      limit: null,
      used: 0,
      remaining: null,
    };
  }

  if (!subscription.plan) {
    // Defensive: a dangling subscription must not crash every planner page.
    return {
      active: false,
      canCreate: false,
      reason: "no_plan",
      plan: null,
      subscription: null,
      limit: null,
      used: subscription.invitations_used,
      remaining: null,
    };
  }

  const now = opts.now ?? new Date();
  const periodEnd = new Date(subscription.current_period_end);
  const live =
    subscription.status === "active" && periodEnd.getTime() >= now.getTime();

  const limit =
    subscription.invitation_limit_override ??
    (subscription.billing_cycle === "monthly"
      ? subscription.plan.monthly_invitation_limit
      : subscription.plan.yearly_invitation_limit);

  const used = subscription.invitations_used;
  const remaining = limit === null ? null : Math.max(limit - used, 0);
  const canCreate = live && (limit === null || used < limit);

  let reason: PlannerEntitlementReason = "ready";
  if (!live) {
    reason = subscription.status === "active" ? "expired" : "inactive";
  } else if (!canCreate) {
    reason = "limit_reached";
  }

  return {
    active: live,
    canCreate,
    reason,
    plan: subscription.plan,
    subscription,
    limit,
    used,
    remaining,
  };
}

/**
 * Atomically reserves one invitation slot. The database function locks the
 * subscription row, so two tabs cannot both pass the final slot check.
 */
export async function claimPlannerInvitationSlot(
  subscriptionId: string,
  profileId: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_planner_invitation", {
    p_subscription_id: subscriptionId,
    p_profile_id: profileId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Returns a slot after a failed wedding insert/publish. */
export async function releasePlannerInvitationSlot(subscriptionId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("release_planner_invitation", {
    p_subscription_id: subscriptionId,
  });
  if (error) console.warn("[planner] could not release invitation slot", error.message);
}

export async function refreshPlannerRole(profileId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: "planner" })
    .eq("id", profileId)
    .eq("role", "customer");
  if (error) console.warn("[planner] could not update role", error.message);
}

export async function createPlannerPlan(input: PlannerPlanInput): Promise<PlannerPlanRow> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("planner_plans")
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      monthly_price_paise: input.monthlyPricePaise,
      yearly_price_paise: input.yearlyPricePaise,
      currency: input.currency ?? "INR",
      monthly_invitation_limit: input.monthlyInvitationLimit ?? null,
      yearly_invitation_limit: input.yearlyInvitationLimit ?? null,
      razorpay_monthly_plan_id: input.razorpayMonthlyPlanId ?? null,
      razorpay_yearly_plan_id: input.razorpayYearlyPlanId ?? null,
      active: input.active ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return planRow(data as PlannerPlanRow);
}

export async function updatePlannerPlan(
  planId: string,
  input: Partial<PlannerPlanInput>
): Promise<PlannerPlanRow> {
  const supabase = createAdminClient();
  const update: PlannerPlanUpdate = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.slug !== undefined) update.slug = input.slug;
  if (input.description !== undefined) update.description = input.description;
  if (input.monthlyPricePaise !== undefined) update.monthly_price_paise = input.monthlyPricePaise;
  if (input.yearlyPricePaise !== undefined) update.yearly_price_paise = input.yearlyPricePaise;
  if (input.currency !== undefined) update.currency = input.currency;
  if (input.monthlyInvitationLimit !== undefined) update.monthly_invitation_limit = input.monthlyInvitationLimit;
  if (input.yearlyInvitationLimit !== undefined) update.yearly_invitation_limit = input.yearlyInvitationLimit;
  if (input.razorpayMonthlyPlanId !== undefined) update.razorpay_monthly_plan_id = input.razorpayMonthlyPlanId;
  if (input.razorpayYearlyPlanId !== undefined) update.razorpay_yearly_plan_id = input.razorpayYearlyPlanId;
  if (input.active !== undefined) update.active = input.active;

  const { data, error } = await supabase
    .from("planner_plans")
    .update(update)
    .eq("id", planId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return planRow(data as PlannerPlanRow);
}

export async function deactivatePlannerPlan(planId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("planner_plans").update({ active: false }).eq("id", planId);
  if (error) throw new Error(error.message);
}

export interface AssignPlannerPlanInput {
  profileId: string;
  planId: string;
  billingCycle: PlannerBillingCycle;
  periodEnd?: string | null;
  invitationLimitOverride?: number | null;
  notes?: string | null;
  createdBy?: string | null;
}

/** Admin assignment: replace any live subscription with a fresh period. */
export async function assignPlannerPlan(input: AssignPlannerPlanInput): Promise<PlannerSubscriptionWithPlan> {
  const supabase = createAdminClient();
  const plan = await getPlannerPlan(input.planId, supabase);
  if (!plan || !plan.active) throw new Error("Choose an active planner plan");

  const start = new Date();
  const end = input.periodEnd ? new Date(input.periodEnd) : addMonths(start, input.billingCycle === "yearly" ? 12 : 1);
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    throw new Error("Period end must be in the future");
  }

  const { data: previousRows, error: previousError } = await supabase
    .from("planner_subscriptions")
    .select("id, status")
    .eq("profile_id", input.profileId)
    .in("status", ["active", "past_due", "pending"]);
  if (previousError) throw new Error(previousError.message);

  const { error: retireError } = await supabase
    .from("planner_subscriptions")
    .update({ status: "cancelled" })
    .eq("profile_id", input.profileId)
    .in("status", ["active", "past_due", "pending"]);
  if (retireError) throw new Error(retireError.message);

  const { data, error } = await supabase
    .from("planner_subscriptions")
    .insert({
      profile_id: input.profileId,
      plan_id: input.planId,
      billing_cycle: input.billingCycle,
      status: "active",
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
      invitation_limit_override: input.invitationLimitOverride ?? null,
      source: "admin",
      created_by: input.createdBy ?? null,
      notes: input.notes ?? null,
    })
    .select("*, planner_plans(*)")
    .single();

  if (error) {
    // Assignment is not a database transaction: restore the previous plan if
    // the replacement row could not be written, so a failed admin action does
    // not leave the planner without an entitlement.
    for (const previous of previousRows ?? []) {
      const { error: restoreError } = await supabase
        .from("planner_subscriptions")
        .update({ status: previous.status })
        .eq("id", previous.id);
      if (restoreError) {
        console.error("[planner] could not restore previous subscription", {
          subscriptionId: previous.id,
          error: restoreError.message,
        });
      }
    }
    throw new Error(error.message);
  }

  await refreshPlannerRole(input.profileId);
  return withPlan(data as never);
}

export async function updatePlannerSubscriptionAdmin(input: {
  subscriptionId: string;
  periodEnd?: string | null;
  invitationLimitOverride?: number | null;
  notes?: string | null;
  action?: "extend" | "cancel" | "reset_usage" | "reactivate";
}): Promise<PlannerSubscriptionWithPlan | null> {
  const supabase = createAdminClient();
  const update: PlannerSubscriptionUpdate = {};

  if (input.action === "cancel") {
    update.status = "cancelled";
    update.cancel_at_period_end = false;
    update.cancellation_requested_at = new Date().toISOString();
  } else if (input.action === "reactivate") {
    update.status = "active";
    update.cancel_at_period_end = false;
    update.cancellation_requested_at = null;
  } else if (input.action === "reset_usage") {
    update.invitations_used = 0;
  } else if (input.action === "extend" || input.periodEnd) {
    if (!input.periodEnd) throw new Error("Choose a period end date");
    const end = new Date(input.periodEnd);
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      throw new Error("Period end must be in the future");
    }
    update.current_period_end = end.toISOString();
    update.status = "active";
    update.invitations_used = 0;
  }

  if (input.invitationLimitOverride !== undefined) {
    update.invitation_limit_override = input.invitationLimitOverride;
  }
  if (input.notes !== undefined) update.notes = input.notes;

  if (Object.keys(update).length === 0) {
    return getPlannerSubscription(input.subscriptionId, supabase);
  }

  const { data, error } = await supabase
    .from("planner_subscriptions")
    .update(update)
    .eq("id", input.subscriptionId)
    .select("*, planner_plans(*)")
    .single();
  if (error) throw new Error(error.message);
  return withPlan(data as never);
}

export function planLimitForCycle(plan: PlannerPlanRow, cycle: PlannerBillingCycle): number | null {
  return cycle === "monthly" ? plan.monthly_invitation_limit : plan.yearly_invitation_limit;
}

export function planPriceForCycle(plan: PlannerPlanRow, cycle: PlannerBillingCycle): number {
  return cycle === "monthly" ? plan.monthly_price_paise : plan.yearly_price_paise;
}

/** Used by the Razorpay webhook. Converts provider timestamps to ISO safely. */
export function unixToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

export function snapshotPlanToJson(plan: PlannerPlanRow): Json {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
  };
}

/**
 * Applies Razorpay's subscription state to the local row. Used by both the
 * webhook and the checkout verifier. Unknown provider subscriptions are ignored
 * so a webhook for another environment cannot mutate anything.
 */
export async function applyProviderSubscriptionState(input: {
  providerSubscriptionId: string;
  status: string;
  currentStart?: string | null;
  currentEnd?: string | null;
  cancelAtCycleEnd?: boolean;
}): Promise<{ profileId: string; status: string } | null> {
  const supabase = createAdminClient();
  const { data: local } = await supabase
    .from("planner_subscriptions")
    .select(
      "id, profile_id, status, current_period_start, current_period_end, cancellation_requested_at"
    )
    .eq("provider_subscription_id", input.providerSubscriptionId)
    .maybeSingle();
  if (!local) return null;

  const now = Date.now();
  const effectiveEnd = input.currentEnd ?? local.current_period_end;
  const future = new Date(effectiveEnd).getTime() > now;
  const periodChanged =
    Boolean(input.currentStart) && input.currentStart !== local.current_period_start;

  const providerWantsActive =
    input.status === "active" ||
    input.status === "authenticated" ||
    (input.status === "cancelled" && future);
  if (
    providerWantsActive &&
    (local.status === "cancelled" || local.status === "expired")
  ) {
    // The local row was retired (replaced, admin-cancelled, or already lapsed).
    // A delayed provider event for that old subscription must never displace
    // the planner's current plan or reopen a cancelled one.
    console.warn("[planner] ignoring provider activation for retired subscription", {
      providerSubscriptionId: input.providerSubscriptionId,
      localStatus: local.status,
      providerStatus: input.status,
    });
    return { profileId: local.profile_id, status: local.status };
  }

  let status: "active" | "past_due" | "cancelled" | "expired" = "active";
  switch (input.status) {
    case "active":
    case "authenticated":
      status = "active";
      break;
    case "halted":
    case "paused":
      status = "past_due";
      break;
    case "cancelled":
      status = future ? "active" : "cancelled";
      break;
    case "completed":
    case "expired":
      status = "expired";
      break;
    default:
      status = "active";
  }

  const update: PlannerSubscriptionUpdate = { status };
  if (input.currentStart) update.current_period_start = input.currentStart;
  if (input.currentEnd) update.current_period_end = input.currentEnd;
  if (periodChanged) update.invitations_used = 0;
  if (input.status === "cancelled") {
    update.cancel_at_period_end = true;
    update.cancellation_requested_at = new Date().toISOString();
  } else if (input.status === "active" || input.status === "authenticated") {
    // Razorpay can report an active subscription with cancellation scheduled
    // for the cycle end. Keep that flag, otherwise the panel would offer to
    // cancel it again and imply a renewal that will not happen.
    update.cancel_at_period_end = Boolean(input.cancelAtCycleEnd);
    update.cancellation_requested_at = input.cancelAtCycleEnd
      ? local.cancellation_requested_at ?? new Date().toISOString()
      : null;
  }

  if (status === "active") {
    // Retire any older live row before activation; the partial unique index
    // allows only one active/past-due subscription per planner.
    await supabase
      .from("planner_subscriptions")
      .update({ status: "expired" })
      .eq("profile_id", local.profile_id)
      .in("status", ["active", "past_due"])
      .neq("id", local.id);
  }

  const { error } = await supabase
    .from("planner_subscriptions")
    .update(update)
    .eq("id", local.id);
  if (error) throw new Error(error.message);

  if (status === "active") await refreshPlannerRole(local.profile_id);
  return { profileId: local.profile_id, status };
}
