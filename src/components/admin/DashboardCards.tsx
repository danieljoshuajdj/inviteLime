"use client";

import { Icon } from "@/components/shared/Icon";
import { EmptyState } from "@/components/shared/Badge";
import { formatDate } from "@/lib/utils";

export function DashboardCards({ users, activeInvitations, paidOrders, revenue }: { users: number; activeInvitations: number; paidOrders: number; revenue: string }) {
  const cards = [
    { label: "Registered users", value: users, icon: "group" as const, accent: "text-secondary" },
    { label: "Live invitations", value: activeInvitations, icon: "celebration" as const, accent: "text-primary" },
    { label: "Paid orders", value: paidOrders, icon: "receipt_long" as const, accent: "text-secondary" },
    { label: "Revenue (incl. GST)", value: revenue, icon: "payments" as const, accent: "text-primary" },
  ];
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-outline-variant bg-surface p-5">
          <p className="flex items-center gap-2 font-body-xs font-semibold text-on-surface-variant">
            <Icon name={c.icon} size="sm" className={c.accent} /> {c.label}
          </p>
          <p className="mt-2 font-heading-3xl !text-on-surface">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export function RecentOrders({ orders }: { orders: Array<{ id: string; couple: string; template: string; amount: string; paidAt: string | null }> }) {
  return (
    <div className="mt-6 rounded-2xl border border-outline-variant bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading-md font-semibold !text-on-surface">Recent purchases</h2>
        <span className="font-body-xs text-on-surface-variant">{orders.length} shown</span>
      </div>
      {orders.length === 0 ? (
        <EmptyState icon="receipt_long" title="No purchases yet" description="Paid orders will appear here as guests reserve invitations." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] font-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-start font-body-xs uppercase tracking-wider text-on-surface-variant">
                <th className="py-2 pr-4 text-start font-semibold">Couple</th>
                <th className="py-2 pr-4 text-start font-semibold">Template</th>
                <th className="py-2 pr-4 text-start font-semibold">Amount</th>
                <th className="py-2 text-start font-semibold">Paid at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-4 font-semibold !text-on-surface">{o.couple}</td>
                  <td className="py-3 pr-4 text-on-surface-variant">{o.template}</td>
                  <td className="py-3 pr-4 !text-on-surface">{o.amount}</td>
                  <td className="py-3 text-on-surface-variant">{o.paidAt ? formatDate(o.paidAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}