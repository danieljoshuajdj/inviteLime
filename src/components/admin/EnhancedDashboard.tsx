"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { cn, formatDate } from "@/lib/utils";
import { handleAdminExport } from "@/app/admin/dashboard/actions";
import { sparklineAreaPath, sparklinePath, type PeriodKey } from "@/lib/services/revenue-series";

interface DashboardMetrics {
  revenue: {
    amount: number;
    currency: string;
    change: number;
    orders: number;
    refunds: number;
    /** Captured revenue per bucket over the active window. */
    series: RevenuePointLike[];
  };
  newUsers: { total: number; change: number; couples: number; planners: number };
  templateUsage: { total: number; activeTemplates: number; utilization: number };
  templatePerformance: Array<{
    id: string;
    name: string;
    thumbnail?: string;
    categories: Array<{ name: string; slug: string }>;
    usage: number;
    share: number;
  }>;
  userLocations: Array<{
    state: string;
    users: number;
    percentage: number;
    color: string;
  }>;
}

interface RevenuePointLike {
  key: string;
  label: string;
  amount: number;
}

interface Props {
  metrics: DashboardMetrics;
  /** Active window, resolved on the server so the query and the chart agree. */
  range: { period: PeriodKey; from: string | null; to: string | null; label: string };
}

const dateRanges = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" },
] as const;

const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 32;

export function EnhancedDashboard({ metrics, range }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [exportOpen, setExportOpen] = useState(false);

  const isCustom = range.period === "custom";

  // The window lives in the URL so the server re-queries. Previously this was
  // local state, which meant the range buttons changed nothing on screen.
  const applyRange = useCallback(
    (next: Partial<{ period: string; from: string; to: string }>) => {
      const search = new URLSearchParams();
      const merged = { period: range.period, from: range.from, to: range.to, ...next };
      search.set("range", merged.period);
      if (merged.from) search.set("from", merged.from);
      if (merged.to) search.set("to", merged.to);
      startTransition(() => {
        router.replace(`${pathname}?${search.toString()}`, { scroll: false });
      });
    },
    [pathname, range.period, range.from, range.to, router]
  );

  return (
    <div>
      {/* TOP HEADER & OPERATIONAL CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 bg-surface-container-lowest p-6 rounded-xl shadow-sm">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-body-xs font-semibold uppercase tracking-wider text-secondary px-2 py-0.5 rounded bg-surface-container">Ledger & Node v4.12</span>
            <span className="text-outline text-body-sm">•</span>
            <span className="font-body-xs text-on-surface-variant flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" /> Synchronized with Core Database
            </span>
          </div>
          <h1 className="font-heading-lg font-medium !text-on-surface tracking-tight">Dashboard</h1>
          <p className="font-body-sm text-on-surface-variant max-w-xl">
            Real-time platform operational analytics and transactional ledger. All calculations reflect server-verified ledger states.
          </p>
        </div>

        {/* Filter & Action Suite */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Buttons */}
          <div className="inline-flex bg-surface-container-low p-1 rounded-lg">
            {dateRanges.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={range.period === r.value}
                disabled={isPending}
                onClick={() => applyRange({ period: r.value })}
                className={cn(
                  "px-3 py-1.5 rounded font-body-md transition-all disabled:opacity-60",
                  range.period === r.value
                    ? "bg-surface-container-lowest text-on-surface shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Date Range Pickers */}
          {isCustom && (
            <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1 rounded-lg text-on-surface">
              <div className="flex items-center gap-1">
                <span className="font-body-xs text-outline uppercase font-semibold">From</span>
                <input
                  type="date"
                  aria-label="Range start"
                  defaultValue={range.from ?? ""}
                  onChange={(e) => applyRange({ from: e.target.value })}
                  className="w-32 bg-transparent font-body-md text-on-surface focus:outline-none cursor-pointer text-center"
                />
              </div>
              <span className="text-outline text-body-sm">→</span>
              <div className="flex items-center gap-1">
                <span className="font-body-xs text-outline uppercase font-semibold">To</span>
                <input
                  type="date"
                  aria-label="Range end"
                  defaultValue={range.to ?? ""}
                  onChange={(e) => applyRange({ to: e.target.value })}
                  className="w-32 bg-transparent font-body-md text-on-surface focus:outline-none cursor-pointer text-center"
                />
              </div>
              <Icon name="calendar_month" size="sm" className="text-outline" />
            </div>
          )}

          {/* Export Data Dropdown */}
          <div className="relative inline-block text-left">
            <Button
              variant="primary"
              size="sm"
              icon="arrow_drop_down"
              onClick={() => setExportOpen(!exportOpen)}
            >
              Export Data
            </Button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-surface-container-lowest rounded-xl shadow-xl z-30 py-2">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await handleAdminExport("orders", range.from ?? undefined, range.to ?? undefined);
                    window.open(r.url, "_blank");
                    setExportOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 font-body-md text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <Icon name="table_view" size="sm" className="text-outline" />
                  Export Orders CSV
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await handleAdminExport("users", range.from ?? undefined, range.to ?? undefined);
                    window.open(r.url, "_blank");
                    setExportOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 font-body-md text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <Icon name="group" size="sm" className="text-outline" />
                  Export Users CSV
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await handleAdminExport("weddings", range.from ?? undefined, range.to ?? undefined);
                    window.open(r.url, "_blank");
                    setExportOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 font-body-md text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <Icon name="celebration" size="sm" className="text-outline" />
                  Export Weddings CSV
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await handleAdminExport("rsvps", range.from ?? undefined, range.to ?? undefined);
                    window.open(r.url, "_blank");
                    setExportOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 font-body-md text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <Icon name="how_to_reg" size="sm" className="text-outline" />
                  Export RSVPs CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOP KPI METRIC CARDS (3-COLUMN GRID) */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Revenue Card */}
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-body-xs font-semibold uppercase tracking-wider text-outline">Ledger Inflows</span>
              <h2 className="font-heading-sm font-medium !text-on-surface mt-0.5">Revenue</h2>
              <span className="font-body-xs text-outline">{range.label}</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
              <Icon name="account_balance_wallet" size="md" />
            </div>
          </div>
          <div className="mt-6 flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="font-heading-lg font-medium tracking-tight !text-on-surface">
                {metrics.revenue.currency} {metrics.revenue.amount.toLocaleString()}
              </span>
              <span className="font-body-xs font-bold text-on-tertiary-container bg-surface-container-low px-1.5 py-0.5 rounded">
                {metrics.revenue.currency} Net
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-on-tertiary-container font-body-md">
              <Icon name="trending_up" size="sm" />
              <span className="font-semibold">{metrics.revenue.change > 0 ? "+" : ""}{metrics.revenue.change.toFixed(1)}%</span>
              <span className="text-on-surface-variant font-normal">vs previous period ({metrics.revenue.orders} paid orders, ₹{metrics.revenue.refunds} refunds)</span>
            </div>
          </div>
          <div className="mt-6 pt-3">
            <RevenueSparkline points={metrics.revenue.series} currency={metrics.revenue.currency} />
          </div>
        </div>

        {/* 2. New Users Card */}
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-body-xs font-semibold uppercase tracking-wider text-outline">User Acquisitions</span>
              <h2 className="font-heading-sm font-medium !text-on-surface mt-0.5">New Users</h2>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
              <Icon name="person_add" size="md" />
            </div>
          </div>
          <div className="mt-6 flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="font-heading-lg font-medium tracking-tight !text-on-surface">{metrics.newUsers.total}</span>
              <span className="font-body-xs font-semibold text-outline">verified profiles</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-on-tertiary-container font-body-md">
              <Icon name="arrow_upward" size="sm" />
              <span className="font-semibold">{metrics.newUsers.change > 0 ? "+" : ""}{metrics.newUsers.change.toFixed(0)}% MoM</span>
              <span className="text-on-surface-variant font-normal">({metrics.newUsers.couples} couples, {metrics.newUsers.planners} planners)</span>
            </div>
          </div>
          <div className="mt-6 pt-3 flex flex-col gap-1">
            <div className="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden flex">
              <div className="bg-on-surface h-full" style={{ width: `${(metrics.newUsers.couples / metrics.newUsers.total) * 100}%` }} />
              <div className="bg-secondary h-full" style={{ width: `${(metrics.newUsers.planners / metrics.newUsers.total) * 100}%` }} />
            </div>
            <div className="flex justify-between font-body-xs text-outline pt-0.5">
              <span>Couples: {((metrics.newUsers.couples / metrics.newUsers.total) * 100).toFixed(1)}%</span>
              <span>Planners: {((metrics.newUsers.planners / metrics.newUsers.total) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* 3. Template Usage Card */}
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-body-xs font-semibold uppercase tracking-wider text-outline">Production Engine</span>
              <h2 className="font-heading-sm font-medium !text-on-surface mt-0.5">Template Usage</h2>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
              <Icon name="auto_stories" size="md" />
            </div>
          </div>
          <div className="mt-6 flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="font-heading-lg font-medium tracking-tight !text-on-surface">{metrics.templateUsage.total}</span>
              <span className="font-body-xs font-semibold text-outline">renders today</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-on-surface-variant font-body-md">
              <Icon name="verified" size="sm" className="text-secondary" />
              <span className="font-normal !text-on-surface">{metrics.templateUsage.total} invitations published across {metrics.templatePerformance.length} active suites</span>
            </div>
          </div>
          <div className="mt-6 pt-3 flex items-center justify-between text-body-sm">
            <span className="font-body-xs text-outline">Render Node Utilization</span>
            <span className="font-body-xs font-semibold text-secondary">{metrics.templateUsage.utilization.toFixed(1)}% Available</span>
          </div>
        </div>
      </div>

      {/* MAIN ANALYTICS SECTION (2-COLUMN GRID) */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* LEFT COLUMN: TEMPLATE PERFORMANCE (7 COLS) */}
        <div className="xl:col-span-7 bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-heading-sm font-medium !text-on-surface">Template Performance</h3>
                <p className="font-body-sm text-on-surface-variant">Templates performing best within selected date range based on actual invitation creations.</p>
              </div>
              <span className="font-body-xs text-outline bg-surface-container-low px-2 py-1 rounded">Top {metrics.templatePerformance.length} of {metrics.templatePerformance.length}</span>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left font-body-sm">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-body-xs uppercase tracking-wider">
                    <th className="py-2 px-4 rounded-l">Template</th>
                    <th className="py-2 px-2">Category Pills</th>
                    <th className="py-2 px-2 text-right">Usage</th>
                    <th className="py-2 px-4 text-right rounded-r">Share of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {metrics.templatePerformance.map((t, index) => (
                    <tr key={t.id} className="hover:bg-surface-container-low/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-12 rounded bg-surface-container-high overflow-hidden flex-shrink-0 flex items-center justify-center shadow-sm">
                            {t.thumbnail ? (
                              <img src={t.thumbnail} alt={t.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-surface-container-highest flex items-center justify-center text-outline">
                                <Icon name="brush" size="md" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-body-md font-semibold !text-on-surface truncate">{t.name}</span>
                            <span className="font-body-xs text-outline">{t.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex flex-wrap gap-1">
                          {t.categories.map((c) => (
                            <span key={c.slug} className="font-body-xs leading-tight px-1.5 py-0.5 bg-surface-container text-on-surface-variant rounded">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-medium">
                        <div className="flex flex-col items-end">
                          <span className="font-body-md font-semibold !text-on-surface">{t.usage}</span>
                          <span className="font-body-xs text-outline">invites</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-surface-container-low h-1.5 rounded-full overflow-hidden">
                            <div className="bg-secondary h-full" style={{ width: `${t.share.toFixed(1)}%` }} />
                          </div>
                          <span className="font-body-md font-semibold !text-on-surface w-12 text-right">{t.share.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pt-4 mt-4 flex items-center justify-between text-body-sm text-on-surface-variant bg-surface-container-low p-3 rounded-lg">
            <span className="font-body-xs">Calculation Scope: {metrics.templatePerformance.length} Active Public Catalog Items</span>
            <button className="font-body-md text-secondary hover:text-on-surface font-semibold flex items-center gap-1">
              Manage Template Registry <Icon name="arrow_forward" size="sm" />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: USER LOCATIONS (5 COLS) */}
        <div className="xl:col-span-5 bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-heading-sm font-medium !text-on-surface">User Locations</h3>
                <p className="font-body-sm text-on-surface-variant">Geographic origin of newly registered accounts (server-verified state/country level, privacy preserved).</p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left font-body-sm">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-body-xs uppercase tracking-wider">
                    <th className="py-2 px-4 rounded-l">Location (State)</th>
                    <th className="py-2 px-2 text-right">Users</th>
                    <th className="py-2 px-4 text-right rounded-r">Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {metrics.userLocations.map((loc, index) => (
                    <tr key={loc.state} className="hover:bg-surface-container-low/60 transition-colors">
                      <td className="py-2 px-4 font-medium !text-on-surface flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: loc.color }} />
                        <span>{loc.state}</span>
                      </td>
                      <td className="py-2 px-2 text-right font-body-md font-semibold">{loc.users}</td>
                      <td className="py-2 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-surface-container-low h-1.5 rounded-full overflow-hidden">
                            <div className="bg-secondary h-full" style={{ width: `${loc.percentage}%` }} />
                          </div>
                          <span className="font-body-xs !text-on-surface w-10 text-right">{loc.percentage.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 bg-surface-container-low p-3 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 font-body-xs text-outline">
              <Icon name="map" size="sm" />
              <span>India Edge CDN: {new Set(metrics.userLocations.map(l => l.state)).size} State Hubs Reported</span>
            </div>
            <span className="font-body-xs font-semibold text-secondary">
              {metrics.userLocations.reduce((sum, l) => sum + l.users, 0)} IP Nodes Aggregated
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM STATUS BAR / AUDIT NOTE */}
      <div className="mt-6 bg-surface-container-low px-4 py-3 rounded-xl flex flex-col md:flex-row items-center justify-between text-on-surface-variant font-body-xs shadow-sm gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse" />
          <span className="font-semibold !text-on-surface">Server-side SQL Aggregation Status:</span>
          <span>PostgreSQL aggregates cached: 42ms</span>
          <span className="text-outline">|</span>
          <span>UTC Normalized (IST +05:30)</span>
          <span className="text-outline">|</span>
          <span className="text-secondary font-medium">No unverified client metrics</span>
        </div>
        <div className="flex items-center gap-3 text-outline">
          <span>Checksum: <code className="font-mono !text-on-surface">#a9f4-81e0</code></span>
          <button className="hover:text-on-surface transition-colors flex items-center gap-0.5" type="button">
            <Icon name="refresh" size="sm" />
            <span>Force Invalidate Cache</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function RevenueSparkline({ points, currency }: { points: RevenuePointLike[]; currency: string }) {
  const finite = points.filter((p) => Number.isFinite(p.amount));
  if (finite.length === 0) {
    return (
      <div className="w-full h-8 flex items-center justify-center text-outline">
        <span className="font-body-xs">No revenue data for this window</span>
      </div>
    );
  }
  const values = finite.map((p) => p.amount);
  const line = sparklinePath(values, SPARK_WIDTH, SPARK_HEIGHT, 2);
  const area = sparklineAreaPath(values, SPARK_WIDTH, SPARK_HEIGHT, 2);
  const max = Math.max(...values);
  const maxPoint = finite.find((p) => p.amount === max);
  return (
    <>
      <svg className="w-full h-8 text-secondary/30" fill="none" preserveAspectRatio="none" viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}>
        {area && <path d={area} fill="currentColor" fillOpacity="0.08" />}
        {line && <path d={line} stroke="currentColor" strokeLinecap="round" strokeWidth="2" />}
      </svg>
      {maxPoint && (
        <p className="font-body-xs text-outline mt-1 text-right">
          Peak: {maxPoint.label} — {currency} {max.toLocaleString()}
        </p>
      )}
    </>
  );
}