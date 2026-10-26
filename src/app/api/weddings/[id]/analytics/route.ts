/**
 * Customer analytics endpoint — returns aggregated stats for a customer's
 * own wedding. Never exposes personal visitor information.
 *
 * GET /api/weddings/[id]/analytics
 *
 * Auth: authenticated user who owns the wedding.
 * Returns: aggregated view counts and RSVP stats only.
 */

import { createServerClient } from "@/lib/supabase/server";
import { requireUser, jsonError } from "@/lib/services/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: weddingId } = await params;
  const supabase = await createServerClient();

  try {
    const { user } = await requireUser(supabase);

    // Verify ownership — RLS also enforces this but we want a clear 403
    const { data: wedding, error: wErr } = await supabase
      .from("weddings")
      .select("id, status, rsvp_toggle")
      .eq("id", weddingId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wErr || !wedding) return jsonError(404, "Wedding not found or access denied");

    const adminClient = createAdminClient();

    const [viewsRes, rsvpTotalRes, attendingRes, decliningRes, pendingRes, recentViewsRes] = await Promise.all([
      // Total views
      adminClient.from("invitation_views").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId),
      // Total RSVP responses
      adminClient.from("rsvp_responses").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId),
      // Attending count
      adminClient.from("rsvp_responses").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId).eq("attendance", "attending"),
      // Declining count
      adminClient.from("rsvp_responses").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId).eq("attendance", "declining"),
      // Pending count
      adminClient.from("rsvp_responses").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId).eq("attendance", "pending"),
      // Recent views (last 30 days, aggregated by date — no personal info)
      adminClient
        .from("invitation_views")
        .select("viewed_at")
        .eq("wedding_id", weddingId)
        .gte("viewed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("viewed_at", { ascending: false })
        .limit(500),
    ]);

    // Aggregate views by day (no IP/UA exposed to client)
    const viewsByDay = aggregateByDay(recentViewsRes.data?.map((v) => v.viewed_at) ?? []);

    return Response.json({
      weddingId,
      status: wedding.status,
      views: {
        total: viewsRes.count ?? 0,
        byDay: viewsByDay,
      },
      rsvp: {
        enabled: wedding.rsvp_toggle,
        total: rsvpTotalRes.count ?? 0,
        attending: attendingRes.count ?? 0,
        declining: decliningRes.count ?? 0,
        pending: pendingRes.count ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "AUTH_REQUIRED") return jsonError(401, "Sign in required");
    return jsonError(500, "Failed to load analytics");
  }
}

function aggregateByDay(timestamps: string[]): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const day = ts.slice(0, 10); // YYYY-MM-DD
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
