import { createAdminClient } from "@/lib/supabase/admin";
import { EnhancedDashboard } from "@/components/admin/EnhancedDashboard";
import { storagePublicUrl } from "@/lib/services/templates";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import {
  bucketRevenue,
  periodToRange,
  type PeriodKey,
  type RevenuePoint,
} from "@/lib/services/revenue-series";

export const dynamic = "force-dynamic";

const PERIOD_KEYS: PeriodKey[] = ["today", "week", "year", "custom"];

/** Human label for the active window, so the card states what it is showing. */
function rangeLabel(period: PeriodKey, from: string | null, to: string | null): string {
  switch (period) {
    case "today":
      return "Today";
    case "week":
      return "Last 7 days";
    case "year":
      return "This year";
    case "custom":
      return from && to ? `${from} to ${to}` : "Custom range";
    default:
      return "Selected period";
  }
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = createAdminClient();
  void admin.rpc("mark_expired_invitations").then(
    () => {},
    () => {}
  );

  const params = await searchParams;
  const requested = typeof params.range === "string" ? params.range : "today";
  const period: PeriodKey = PERIOD_KEYS.includes(requested as PeriodKey)
    ? (requested as PeriodKey)
    : "today";
  const from = typeof params.from === "string" ? params.from : null;
  const to = typeof params.to === "string" ? params.to : null;
  const { start, end } = periodToRange(period, from, to);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [
    users,
    paidOrders,
    revenue,
    templatePerformance,
  ] = await Promise.all([
    admin.from("profiles").select("id, role", { count: "exact" }),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .gte("paid_at", startIso)
      .lte("paid_at", endIso),
    // Captured payments, scoped to the same window the graph is drawn over, so
    // the headline figure and the line can never describe different periods.
    admin
      .from("payments")
      .select("amount_paise, currency, paid_at")
      .eq("status", "captured")
      .gte("paid_at", startIso)
      .lte("paid_at", endIso),
    admin
      .from("templates")
      .select(`id, name, slug, thumbnail_path, product:products(price_paise, currency), categories:template_categories(category:categories(name, slug))`)
      .eq("status", "active"),
  ]);

  const revenueRows = (revenue.data ?? []) as Array<{
    amount_paise: number;
    currency: string;
    paid_at: string | null;
  }>;

  const revenuePaise = revenueRows.reduce((n, r) => n + Number(r.amount_paise ?? 0), 0);
  const currency = revenueRows[0]?.currency ?? "INR";
  const revenueSeries: RevenuePoint[] = bucketRevenue(revenueRows, { start, end });

  // Calculate new users (last 30 days)
  // eslint-disable-next-line react-hooks/purity -- server component; stable within request
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: newUsersData } = await admin
    .from("profiles")
    .select("id, role", { count: "exact" })
    .gte("created_at", thirtyDaysAgo);

  const newUsersCount = newUsersData?.length ?? 0;
  const couplesCount = newUsersData?.filter((u: { role: string }) => u.role === "customer").length ?? 0;
  const plannersCount = newUsersData?.filter((u: { role: string }) => u.role === "planner").length ?? 0;

  // Build template performance from templates + orders
  const { data: ordersData } = await admin
    .from("orders")
    .select("template_id")
    .eq("status", "paid");

  const templateUsageMap = new Map<string, number>();
  ordersData?.forEach((o: { template_id: string }) => {
    const count = templateUsageMap.get(o.template_id) ?? 0;
    templateUsageMap.set(o.template_id, count + 1);
  });

  const totalUsage = Array.from(templateUsageMap.values()).reduce((a, b) => a + b, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const templatePerf = (templatePerformance.data ?? []).map((t: any) => {
    const usage = templateUsageMap.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      thumbnail: t.thumbnail_path ? storagePublicUrl("templates", t.thumbnail_path) : undefined,
      categories: (t.categories ?? []).map((tc: { category: { name: string; slug: string } | null }) => tc.category).filter(Boolean) as { name: string; slug: string }[],
      usage,
      share: totalUsage > 0 ? (usage / totalUsage) * 100 : 0,
    };
  }).sort((a, b) => b.usage - a.usage);

  // Illustrative breakdown for local UI review only. The platform has no
  // geographic signal, so the live dashboard must report none.
  const sampleUserLocations = [
    { state: "Tamil Nadu", users: 124, percentage: 36.2, color: "#fed488" },
    { state: "Kerala", users: 87, percentage: 25.4, color: "#d3e8d5" },
    { state: "Karnataka", users: 52, percentage: 15.2, color: "#c6c6cd" },
    { state: "Maharashtra", users: 41, percentage: 12.0, color: "#c6c6cd" },
    { state: "Delhi NCR", users: 26, percentage: 7.6, color: "#c6c6cd" },
    { state: "Telangana", users: 12, percentage: 3.5, color: "#c6c6cd" },
  ];

  // Sample metrics are for local UI review only. Outside preview mode the
  // dashboard must surface the real error, never invented numbers.
  if (users.error && isAdminPreviewMode()) {
    return (
      <EnhancedDashboard
        range={{ period, from, to, label: rangeLabel(period, from, to) }}
        metrics={{
          revenue: {
            amount: 1284500,
            currency: "INR",
            change: 18.4,
            orders: 862,
            refunds: 12400,
            series: [
              { key: "d1", label: "1", amount: 120000 },
              { key: "d2", label: "2", amount: 180000 },
              { key: "d3", label: "3", amount: 150000 },
              { key: "d4", label: "4", amount: 240000 },
              { key: "d5", label: "5", amount: 210000 },
              { key: "d6", label: "6", amount: 384500 },
            ],
          },
          newUsers: { total: 342, change: 12, couples: 268, planners: 74 },
          templateUsage: { total: 1240, activeTemplates: 3, utilization: 41.2 },
          templatePerformance: [
            { id: "a1b2c3d4", name: "Royal Mughal Palace", categories: [{ name: "Wedding", slug: "wedding" }, { name: "Grand", slug: "grand" }], usage: 512, share: 41.3 },
            { id: "e5f6a7b8", name: "Coastal Villa Sunset", categories: [{ name: "Villa destination", slug: "villa-destination" }], usage: 431, share: 34.8 },
            { id: "c9d0e1f2", name: "Minimal Vows", categories: [{ name: "Wedding", slug: "wedding" }], usage: 297, share: 23.9 },
          ],
          userLocations: sampleUserLocations,
        }}
      />
    );
  }

  return (
    <EnhancedDashboard
      range={{ period, from, to, label: rangeLabel(period, from, to) }}
      metrics={{
        revenue: {
          amount: revenuePaise / 100,
          currency,
          // No prior-period comparison is stored, so report no trend rather
          // than a fabricated percentage.
          change: 0,
          orders: paidOrders.count ?? 0,
          refunds: 0,
          series: revenueSeries,
        },
        newUsers: {
          total: newUsersCount,
          change: 0,
          couples: couplesCount,
          planners: plannersCount,
        },
        templateUsage: {
          total: totalUsage,
          activeTemplates: templatePerformance.data?.length ?? 0,
          utilization: 0,
        },
        templatePerformance: templatePerf,
        userLocations: [],
      }}
    />
  );
}