import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import { createPlannerPlan, listPlannerPlans } from "@/lib/services/planner-plans";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

const planSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  monthlyPricePaise: z.number().int().min(0).max(100_000_000),
  yearlyPricePaise: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().length(3).optional(),
  monthlyInvitationLimit: z.number().int().min(1).max(100_000).optional().nullable(),
  yearlyInvitationLimit: z.number().int().min(1).max(100_000).optional().nullable(),
  razorpayMonthlyPlanId: z.string().trim().max(120).optional().nullable(),
  razorpayYearlyPlanId: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET() {
  try {
    const supabase = await createServerClient();
    await requireAdmin(supabase);
    return Response.json({ plans: await listPlannerPlans({ includeInactive: true }) });
  } catch (e) {
    return adminApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const admin = await requireAdmin(supabase);
    const parsed = planSchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid plan", parsed.error.flatten());

    const slug = slugify(parsed.data.slug || parsed.data.name) || `planner-${Date.now()}`;
    const plan = await createPlannerPlan({
      ...parsed.data,
      slug,
      currency: parsed.data.currency?.toUpperCase() ?? "INR",
      description: parsed.data.description ?? null,
      razorpayMonthlyPlanId: parsed.data.razorpayMonthlyPlanId?.trim() || null,
      razorpayYearlyPlanId: parsed.data.razorpayYearlyPlanId?.trim() || null,
    });
    await logAdminAction(admin.user.id, "planner_plan.create", "planner_plan", plan.id, {
      name: plan.name,
      slug: plan.slug,
    });
    return Response.json({ plan }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/duplicate|unique/i.test(message)) return jsonError(409, "That plan slug is already in use.");
    return adminApiError(e);
  }
}
