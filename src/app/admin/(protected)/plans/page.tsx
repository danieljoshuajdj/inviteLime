import { listPlannerPlans } from "@/lib/services/planner-plans";
import { PlansManager, type AdminPlan } from "@/components/admin/PlansManager";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const plans = await listPlannerPlans({ includeInactive: true }).catch(() => []);
  const rows: AdminPlan[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    monthlyPricePaise: p.monthly_price_paise,
    yearlyPricePaise: p.yearly_price_paise,
    currency: p.currency,
    monthlyInvitationLimit: p.monthly_invitation_limit,
    yearlyInvitationLimit: p.yearly_invitation_limit,
    razorpayMonthlyPlanId: p.razorpay_monthly_plan_id,
    razorpayYearlyPlanId: p.razorpay_yearly_plan_id,
    active: p.active,
  }));

  return <PlansManager initialPlans={rows} />;
}
