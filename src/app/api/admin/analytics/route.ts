/**
 * Admin dashboard analytics endpoint.
 *
 * GET /api/admin/analytics?period=today|yesterday|7d|30d|month|prev_month|custom&from=ISO&to=ISO
 *
 * Returns aggregated stats for the admin dashboard. All computation happens
 * server-side; no large datasets are sent to the client for calculation.
 * Requires admin authentication.
 */

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/services/helpers";
import { adminApiError } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Period = "today" | "yesterday" | "7d" | "30d" | "month" | "prev_month" | "custom";

function periodToRange(period: Period, from?: string | null, to?: string | null): { start: Date; end: Date } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { start: todayStart, end: now };

    case "yesterday": {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      return { start: y, end: todayStart };
    }

    case "7d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 7);
      return { start: s, end: now };
    }

    case "30d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 30);
      return { start: s, end: now };
    }

    case "month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: s, end: now };
    }

    case "prev_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: s, end: e };
    }

    case "custom": {
      const s = from ? new Date(from) : todayStart;
      const e = to ? new Date(to) : now;
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return { start: todayStart, end: now };
      return { start: s, end: e };
    }
  }
}

export async function GET(req: Request) {
  const supabase = await createServerClient();
  try {
    await requireAdmin(supabase);

    const { searchParams } = new URL(req.url);
    const period = (searchParams.get("period") ?? "7d") as Period;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const { start, end } = periodToRange(period, from, to);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const adminClient = createAdminClient();

    // Run all counts in parallel for performance
    const [
      ordersRes,
      paidOrdersRes,
      weddingsRes,
      publishedRes,
      rsvpRes,
      viewsRes,
      newUsersRes,
      // All-time totals (no date filter)
      totalWeddingsRes,
      totalUsersRes,
      totalRevenueRes,
    ] = await Promise.all([
      adminClient.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startIso).lte("created_at", endIso),
      adminClient.from("orders").select("id, amount_paise", { count: "exact" }).eq("status", "paid").gte("paid_at", startIso).lte("paid_at", endIso),
      adminClient.from("weddings").select("id", { count: "exact", head: true }).gte("created_at", startIso).lte("created_at", endIso),
      adminClient.from("weddings").select("id", { count: "exact", head: true }).eq("status", "active").gte("published_at", startIso).lte("published_at", endIso),
      adminClient.from("rsvp_responses").select("id", { count: "exact", head: true }).gte("created_at", startIso).lte("created_at", endIso),
      adminClient.from("invitation_views").select("id", { count: "exact", head: true }).gte("viewed_at", startIso).lte("viewed_at", endIso),
      adminClient.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", startIso).lte("created_at", endIso),
      adminClient.from("weddings").select("id", { count: "exact", head: true }),
      adminClient.from("profiles").select("id", { count: "exact", head: true }),
      adminClient.from("orders").select("amount_paise").eq("status", "paid"),
    ]);

    // Revenue calculation
    const periodRevenuePaise = (paidOrdersRes.data ?? []).reduce((sum, o) => sum + (o.amount_paise ?? 0), 0);
    const totalRevenuePaise = (totalRevenueRes.data ?? []).reduce((sum, o) => sum + (o.amount_paise ?? 0), 0);

    return Response.json({
      period: { type: period, start: startIso, end: endIso },
      current: {
        orders: ordersRes.count ?? 0,
        paidOrders: paidOrdersRes.count ?? 0,
        revenuePaise: periodRevenuePaise,
        weddings: weddingsRes.count ?? 0,
        publishedWeddings: publishedRes.count ?? 0,
        rsvps: rsvpRes.count ?? 0,
        views: viewsRes.count ?? 0,
        newUsers: newUsersRes.count ?? 0,
      },
      totals: {
        weddings: totalWeddingsRes.count ?? 0,
        users: totalUsersRes.count ?? 0,
        revenuePaise: totalRevenuePaise,
      },
    });
  } catch (e) {
    return adminApiError(e);
  }
}
