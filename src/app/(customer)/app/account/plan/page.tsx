import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";
import { getPlannerBrand, isPlannerBrandComplete } from "@/lib/services/planner-branding";
import { getPlannerEntitlement, listPlannerPlans } from "@/lib/services/planner-plans";
import { razorpayConfigured } from "@/lib/services/payments";
import { AccountTabs } from "@/components/account/AccountTabs";
import { PlannerPlanPanel } from "@/components/account/PlannerPlanPanel";

export const metadata: Metadata = { title: "Planner plan" };
export const dynamic = "force-dynamic";

export default async function PlannerPlanPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/account/plan");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const [entitlement, plans, brand] = await Promise.all([
    getPlannerEntitlement(user.id).catch(() => null),
    listPlannerPlans({ includeInactive: false }).catch(() => []),
    getPlannerBrand(user.id).catch(() => null),
  ]);

  const subscription = entitlement?.subscription ?? null;

  return (
    <div>
      <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Planner</p>
      <h1 className="mt-1 font-heading-2xl !text-on-surface">Planner plan</h1>
      <div className="mt-5">
        <AccountTabs
          active="plan"
          isPlanner={profile?.role === "planner" || Boolean(entitlement?.active)}
        />
      </div>

      <div className="mt-6">
        <PlannerPlanPanel
          plans={plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            monthlyPricePaise: plan.monthly_price_paise,
            yearlyPricePaise: plan.yearly_price_paise,
            currency: plan.currency,
            monthlyInvitationLimit: plan.monthly_invitation_limit,
            yearlyInvitationLimit: plan.yearly_invitation_limit,
          }))}
          entitlement={{
            active: Boolean(entitlement?.active),
            planName: entitlement?.plan?.name ?? null,
            billingCycle: subscription?.billing_cycle ?? null,
            status: subscription?.status ?? null,
            endsAt: subscription?.current_period_end ?? null,
            used: entitlement?.used ?? 0,
            limit: entitlement?.limit ?? null,
            source: subscription?.source ?? null,
            cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
          }}
          brandComplete={isPlannerBrandComplete(brand)}
          billingConfigured={razorpayConfigured()}
          email={user.email ?? ""}
        />
      </div>
    </div>
  );
}
