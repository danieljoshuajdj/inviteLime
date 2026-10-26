import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import { deactivatePlannerPlan, updatePlannerPlan } from "@/lib/services/planner-plans";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  monthlyPricePaise: z.number().int().min(0).max(100_000_000).optional(),
  yearlyPricePaise: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.string().trim().length(3).optional(),
  monthlyInvitationLimit: z.number().int().min(1).max(100_000).optional().nullable(),
  yearlyInvitationLimit: z.number().int().min(1).max(100_000).optional().nullable(),
  razorpayMonthlyPlanId: z.string().trim().max(120).optional().nullable(),
  razorpayYearlyPlanId: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid plan id");
    const supabase = await createServerClient();
    const admin = await requireAdmin(supabase);
    const parsed = patchSchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid plan", parsed.error.flatten());

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.slug !== undefined) {
      // An empty slug from the form means "leave it alone", never write "".
      if (parsed.data.slug) patch.slug = slugify(parsed.data.slug);
      else delete patch.slug;
    }
    if (parsed.data.currency) patch.currency = parsed.data.currency.toUpperCase();
    if (parsed.data.description !== undefined) patch.description = parsed.data.description || null;
    if (parsed.data.razorpayMonthlyPlanId !== undefined) {
      patch.razorpayMonthlyPlanId = parsed.data.razorpayMonthlyPlanId?.trim() || null;
    }
    if (parsed.data.razorpayYearlyPlanId !== undefined) {
      patch.razorpayYearlyPlanId = parsed.data.razorpayYearlyPlanId?.trim() || null;
    }

    const plan = await updatePlannerPlan(id, patch);
    await logAdminAction(admin.user.id, "planner_plan.update", "planner_plan", id);
    return Response.json({ plan });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/duplicate|unique/i.test(message)) return jsonError(409, "That plan slug is already in use.");
    return adminApiError(e);
  }
}

/**
 * Plans are deactivated, never hard-deleted: historical subscriptions still
 * reference them, and deleting would erase the name a planner paid for.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid plan id");
    const supabase = await createServerClient();
    const admin = await requireAdmin(supabase);
    await deactivatePlannerPlan(id);
    await logAdminAction(admin.user.id, "planner_plan.deactivate", "planner_plan", id);
    return Response.json({ ok: true });
  } catch (e) {
    return adminApiError(e);
  }
}
