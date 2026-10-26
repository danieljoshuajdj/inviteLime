import { describe, expect, it } from "vitest";

import type { Supabase } from "@/lib/services/helpers";
import { getLatestPlannerSubscription, getPlannerEntitlement } from "@/lib/services/planner-plans";

const plan = {
  id: "plan-1",
  name: "Atelier",
  slug: "atelier",
  description: null,
  monthly_price_paise: 299900,
  yearly_price_paise: 2999900,
  currency: "INR",
  monthly_invitation_limit: null,
  yearly_invitation_limit: null,
  razorpay_monthly_plan_id: null,
  razorpay_yearly_plan_id: null,
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    profile_id: "planner-1",
    plan_id: plan.id,
    billing_cycle: "monthly",
    status: "active",
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: false,
    cancellation_requested_at: null,
    invitations_used: 0,
    invitation_limit_override: null,
    source: "admin",
    provider_subscription_id: null,
    created_by: null,
    notes: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    planner_plans: plan,
    ...overrides,
  };
}

function clientReturning(rows: Record<string, unknown>[]): Supabase {
  const query = {
    from: () => query,
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: rows, error: null }),
  };
  return query as unknown as Supabase;
}

const now = new Date("2026-10-22T00:00:00.000Z");

describe("planner entitlement", () => {
  it("reports no plan when there is no subscription", async () => {
    const entitlement = await getPlannerEntitlement("planner-1", {
      client: clientReturning([]),
      now,
    });
    expect(entitlement).toEqual(
      expect.objectContaining({ active: false, canCreate: false, reason: "no_plan" })
    );
  });

  it("allows unlimited publishing on a live plan", async () => {
    const entitlement = await getPlannerEntitlement("planner-1", {
      client: clientReturning([subscription({ invitations_used: 120 })]),
      now,
    });
    expect(entitlement.active).toBe(true);
    expect(entitlement.canCreate).toBe(true);
    expect(entitlement.reason).toBe("ready");
    expect(entitlement.limit).toBeNull();
    expect(entitlement.remaining).toBeNull();
  });

  it("uses the cycle limit and blocks only new invitations when full", async () => {
    const entitlement = await getPlannerEntitlement("planner-1", {
      client: clientReturning([
        subscription({
          billing_cycle: "yearly",
          invitations_used: 25,
          planner_plans: { ...plan, yearly_invitation_limit: 25 },
        }),
      ]),
      now,
    });
    expect(entitlement.active).toBe(true);
    expect(entitlement.canCreate).toBe(false);
    expect(entitlement.reason).toBe("limit_reached");
    expect(entitlement.limit).toBe(25);
    expect(entitlement.remaining).toBe(0);
  });

  it("honours a per-planner limit override", async () => {
    const entitlement = await getPlannerEntitlement("planner-1", {
      client: clientReturning([
        subscription({
          invitations_used: 3,
          invitation_limit_override: 5,
          planner_plans: { ...plan, monthly_invitation_limit: 50 },
        }),
      ]),
      now,
    });
    expect(entitlement.limit).toBe(5);
    expect(entitlement.remaining).toBe(2);
    expect(entitlement.canCreate).toBe(true);
  });

  it("treats a passed period end as expired even while the status still says active", async () => {
    const entitlement = await getPlannerEntitlement("planner-1", {
      client: clientReturning([
        subscription({ current_period_end: "2026-10-01T00:00:00.000Z" }),
      ]),
      now,
    });
    expect(entitlement.active).toBe(false);
    expect(entitlement.canCreate).toBe(false);
    expect(entitlement.reason).toBe("expired");
  });

  it("reports pending or cancelled subscriptions as inactive", async () => {
    const pending = await getPlannerEntitlement("planner-1", {
      client: clientReturning([subscription({ status: "pending" })]),
      now,
    });
    expect(pending.reason).toBe("inactive");

    const cancelled = await getPlannerEntitlement("planner-1", {
      client: clientReturning([subscription({ status: "cancelled" })]),
      now,
    });
    expect(cancelled.reason).toBe("inactive");
  });

  it("prefers a live row over a cancelled row with a later end date", async () => {
    const latest = await getLatestPlannerSubscription(
      "planner-1",
      clientReturning([
        subscription({
          id: "sub-old",
          status: "cancelled",
          billing_cycle: "yearly",
          current_period_end: "2027-10-01T00:00:00.000Z",
        }),
        subscription({ id: "sub-live" }),
      ])
    );
    expect(latest?.id).toBe("sub-live");
  });

  it("prefers an in-flight checkout over a cancelled row with a later end date", async () => {
    const latest = await getLatestPlannerSubscription(
      "planner-1",
      clientReturning([
        subscription({
          id: "sub-cancelled",
          status: "cancelled",
          billing_cycle: "yearly",
          current_period_end: "2027-10-01T00:00:00.000Z",
        }),
        subscription({ id: "sub-pending", status: "pending" }),
      ])
    );
    expect(latest?.id).toBe("sub-pending");
  });
});
