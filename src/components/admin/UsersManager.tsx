"use client";

import { useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { TextInput } from "@/components/shared/Field";
import { formatDate, formatPrice } from "@/lib/utils";
import { toast } from "@/components/account/toast";

export interface UserPlan {
  subscriptionId: string;
  planId: string;
  planName: string;
  billingCycle: "monthly" | "yearly";
  status: string;
  currentPeriodEnd: string;
  invitationsUsed: number;
  invitationLimitOverride: number | null;
  source: string;
}

export interface PlanOption {
  id: string;
  name: string;
  monthlyPricePaise: number;
  yearlyPricePaise: number;
  currency: string;
  monthlyInvitationLimit: number | null;
  yearlyInvitationLimit: number | null;
}

interface UserRow {
  id: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  fullName: string | null;
  role: "customer" | "planner" | "admin";
  status: "active" | "inactive" | "pending";
  plannerPlan?: UserPlan | null;
}

export function UsersManager({
  users,
  currentUserId,
  plans,
}: {
  users: UserRow[];
  currentUserId: string;
  plans: PlanOption[];
}) {
  const [rows, setRows] = useState(users);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [planUser, setPlanUser] = useState<UserRow | null>(null);

  const filtered = rows.filter(
    (u) =>
      !query ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      (u.fullName ?? "").toLowerCase().includes(query.toLowerCase())
  );

  async function patch(user: UserRow, body: Record<string, unknown>) {
    setBusy(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setRows((rs) => rs.map((r) => (r.id === user.id ? { ...r, ...body } : r)));
      toast("User updated");
    } catch (e) {
      toast("Update failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** What the admin must type in the dialog: the account's email (or its id). */
  const confirmTarget = (u: UserRow) => u.email?.trim() || u.id;

  async function remove(user: UserRow) {
    setBusy(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmTarget(user) }),
      });
      const json = (await res.json()) as {
        error?: string;
        weddingsDeleted?: number;
        objectsDeleted?: number;
      };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");

      setRows((rs) => rs.filter((r) => r.id !== user.id));
      setDeleting(null);
      const weddings = json.weddingsDeleted ?? 0;
      const files = json.objectsDeleted ?? 0;
      toast(
        "User deleted",
        `${weddings} invitation${weddings === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"} removed`
      );
    } catch (e) {
      toast("Delete failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="max-w-sm">
        <TextInput
          label="Search users"
          placeholder="Email or name…"
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-outline-variant p-12 text-center">
          <Icon name="group_off" size="xl" className="mx-auto text-on-surface-variant" />
          <p className="mt-3 font-body-sm text-on-surface-variant">No users match your search.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] font-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-start font-body-xs uppercase tracking-wider text-on-surface-variant">
                <th className="py-2 pr-4 text-start font-semibold">User</th>
                <th className="py-2 pr-4 text-start font-semibold">Role</th>
                <th className="py-2 pr-4 text-start font-semibold">Planner plan</th>
                <th className="py-2 pr-4 text-start font-semibold">Status</th>
                <th className="py-2 pr-4 text-start font-semibold">Signed up</th>
                <th className="py-2 text-start font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold !text-on-surface">
                      {u.fullName || "—"}
                      {u.id === currentUserId && <span className="ml-1.5 font-body-xs text-secondary">(you)</span>}
                    </p>
                    <p className="font-body-xs text-on-surface-variant">{u.email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      className="rounded-lg border border-outline-variant bg-surface px-2 py-1.5 font-body-sm"
                      value={u.role}
                      disabled={busy === u.id || u.id === currentUserId}
                      onChange={(e) => void patch(u, { role: e.target.value })}
                    >
                      <option value="customer">customer</option>
                      <option value="planner">planner</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    {u.plannerPlan ? (
                      <div className="space-y-1">
                        <Badge
                          tone={u.plannerPlan.status === "active" ? "success" : "default"}
                          icon="workspace_premium"
                        >
                          {u.plannerPlan.planName}
                        </Badge>
                        <p className="font-body-xs text-on-surface-variant">
                          {u.plannerPlan.status} · ends {formatDate(u.plannerPlan.currentPeriodEnd)}
                        </p>
                        <p className="font-body-xs text-on-surface-variant">
                          {u.plannerPlan.invitationsUsed} used
                          {u.plannerPlan.invitationLimitOverride
                            ? ` / ${u.plannerPlan.invitationLimitOverride} override`
                            : ""}
                        </p>
                        <Button variant="ghost" size="sm" icon="edit" onClick={() => setPlanUser(u)}>
                          Manage
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" icon="workspace_premium" onClick={() => setPlanUser(u)}>
                        Assign plan
                      </Button>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={u.status === "active" ? "success" : u.status === "pending" ? "default" : "danger"} icon={u.status === "active" ? "check_circle" : "info"}>
                      {u.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-on-surface-variant">{u.createdAt ? formatDate(u.createdAt) : "—"}</td>
                  <td className="py-3 text-on-surface-variant">
                    <div className="flex items-center justify-between gap-2">
                      <span>{u.lastSignInAt ? formatDate(u.lastSignInAt) : "Never"}</span>
                      <span className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="block"
                          disabled={busy === u.id || u.id === currentUserId}
                          onClick={() => void patch(u, { status: u.status === "active" ? "inactive" : "active" })}
                        >
                          {u.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="delete"
                          disabled={busy === u.id || u.id === currentUserId}
                          onClick={() => setDeleting(u)}
                        >
                          Delete
                        </Button>
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 font-body-xs text-on-surface-variant">
        Showing {filtered.length} of {rows.length} accounts. Role changes can never be performed by customers themselves (server + DB enforced).
      </p>

      <PlanDialog
        key={`plan-${planUser?.id ?? "closed"}`}
        user={planUser}
        plans={plans}
        onClose={() => setPlanUser(null)}
        onSaved={(plan) => {
          if (!planUser) return;
          setRows((rs) => rs.map((r) => (r.id === planUser.id ? { ...r, plannerPlan: plan } : r)));
        }}
      />

      <DeleteDialog
        // Remounting per row resets the typed confirmation without an effect.
        key={`delete-${deleting?.id ?? "closed"}`}
        user={deleting}
        busy={busy === deleting?.id}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
      />
    </div>
  );
}

function planFromResponse(json: {
  subscription?: {
    id: string;
    plan_id: string;
    billing_cycle: string;
    status: string;
    current_period_end: string;
    invitations_used: number;
    invitation_limit_override: number | null;
    source: string;
    plan?: { name: string } | null;
    planner_plans?: { name: string } | { name: string }[] | null;
  } | null;
  error?: string;
}): UserPlan | null {
  const sub = json.subscription;
  if (!sub) return null;
  const joined = sub.planner_plans;
  const joinedName = Array.isArray(joined) ? joined[0]?.name : joined?.name;
  const planName = sub.plan?.name ?? joinedName;
  return {
    subscriptionId: sub.id,
    planId: sub.plan_id,
    planName: planName ?? "Planner plan",
    billingCycle: sub.billing_cycle as "monthly" | "yearly",
    status: sub.status,
    currentPeriodEnd: sub.current_period_end,
    invitationsUsed: sub.invitations_used,
    invitationLimitOverride: sub.invitation_limit_override,
    source: sub.source,
  };
}

function PlanDialog({
  user,
  plans,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  plans: PlanOption[];
  onClose: () => void;
  onSaved: (plan: UserPlan | null) => void;
}) {
  const current = user?.plannerPlan ?? null;
  const [planId, setPlanId] = useState(current?.planId ?? plans[0]?.id ?? "");
  const [cycle, setCycle] = useState<"monthly" | "yearly">(current?.billingCycle ?? "monthly");
  const [periodEnd, setPeriodEnd] = useState(
    current ? current.currentPeriodEnd.slice(0, 10) : ""
  );
  const [limitOverride, setLimitOverride] = useState(
    current?.invitationLimitOverride ? String(current.invitationLimitOverride) : ""
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!user) return null;

  const selected = plans.find((p) => p.id === planId) ?? plans[0] ?? null;

  async function call(action: "assign" | "extend" | "cancel" | "reset_usage" | "reactivate") {
    setBusy(action);
    try {
      const parsedLimit = limitOverride.trim() ? Number(limitOverride) : null;
      const res = await fetch(`/api/admin/users/${user!.id}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          planId,
          billingCycle: cycle,
          periodEnd: periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null,
          invitationLimitOverride:
            parsedLimit !== null && Number.isFinite(parsedLimit) && parsedLimit > 0
              ? Math.round(parsedLimit)
              : null,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as Parameters<typeof planFromResponse>[0];
      if (!res.ok) throw new Error(json.error ?? "Plan update failed");
      const next = planFromResponse(json);
      onSaved(next);
      toast(
        action === "assign"
          ? "Plan assigned"
          : action === "cancel"
            ? "Plan cancelled"
            : action === "reset_usage"
              ? "Usage reset"
              : "Plan updated"
      );
      onClose();
    } catch (e) {
      toast("Plan update failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Planner plan · ${user.fullName || user.email}`}
      icon="workspace_premium"
      size="lg"
      blockBackdropClose={Boolean(busy)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
            Close
          </Button>
          {current && (
            <Button
              variant="ghost"
              icon="history_edu"
              disabled={Boolean(busy)}
              onClick={() => void call("reset_usage")}
            >
              Reset usage
            </Button>
          )}
          {current && current.status === "cancelled" ? (
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => void call("reactivate")}>
              Reactivate
            </Button>
          ) : current ? (
            <Button variant="danger" icon="close" disabled={Boolean(busy)} onClick={() => void call("cancel")}>
              Cancel plan
            </Button>
          ) : null}
          <Button loading={busy === "assign"} disabled={Boolean(busy) || !selected} onClick={() => void call("assign")}>
            {current ? "Replace plan" : "Assign plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {current && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-body-sm font-semibold text-on-surface">{current.planName}</p>
              <Badge
                tone={current.status === "active" ? "success" : "default"}
              >
                {current.status}
              </Badge>
            </div>
            <p className="mt-1 font-body-xs text-on-surface-variant">
              {current.billingCycle} · ends {formatDate(current.currentPeriodEnd)} · {current.invitationsUsed} used
              {current.invitationLimitOverride ? ` of ${current.invitationLimitOverride} (override)` : ""}
            </p>
            {selected && (
              <p className="mt-1 font-body-xs text-on-surface-variant">
                Package limit:{" "}
                {cycle === "monthly"
                  ? selected.monthlyInvitationLimit ?? "unlimited"
                  : selected.yearlyInvitationLimit ?? "unlimited"}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 font-body-sm font-medium text-on-surface-variant">
            Plan
            <select
              className="rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5 font-body text-on-surface"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {formatPrice(plan.monthlyPricePaise, plan.currency)}/mo
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-body-sm font-medium text-on-surface-variant">
            Billing cycle
            <select
              className="rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5 font-body text-on-surface"
              value={cycle}
              onChange={(e) => setCycle(e.target.value as "monthly" | "yearly")}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </div>

        {selected && (
          <p className="font-body-xs text-on-surface-variant">
            {formatPrice(cycle === "monthly" ? selected.monthlyPricePaise : selected.yearlyPricePaise, selected.currency)} ·{" "}
            {cycle === "monthly"
              ? selected.monthlyInvitationLimit ?? "unlimited"
              : selected.yearlyInvitationLimit ?? "unlimited"}{" "}
            invitations
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Period end"
            hint="Leave blank on assignment to use one billing cycle. Required for Extend."
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
          <TextInput
            label="Invitation limit override"
            hint="Leave blank to use the package limit."
            type="number"
            min="1"
            value={limitOverride}
            onChange={(e) => setLimitOverride(e.target.value)}
            placeholder="Unlimited"
          />
        </div>
        <TextInput
          label="Internal note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paid by bank transfer, comped, etc."
        />

        {current && (
          <div className="flex flex-wrap gap-2 border-t border-outline-variant pt-4">
            <Button
              variant="outline"
              size="sm"
              icon="calendar_month"
              loading={busy === "extend"}
              disabled={Boolean(busy)}
              onClick={() => {
                if (!periodEnd) {
                  toast("Choose a period end date first");
                  return;
                }
                void call("extend");
              }}
            >
              Extend to date
            </Button>
            <p className="self-center font-body-xs text-on-surface-variant">
              Extending resets this period&apos;s usage counter and reactivates the plan.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DeleteDialog({
  user,
  busy,
  onCancel,
  onConfirm,
}: {
  user: UserRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  if (!user) return null;

  const expected = user.email?.trim() || user.id;
  const matches = typed.trim() === expected;

  return (
    <Modal
      open
      onClose={onCancel}
      title="Delete this user permanently?"
      icon="warning"
      size="md"
      blockBackdropClose={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon="delete" loading={busy} disabled={!matches} onClick={onConfirm}>
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="space-y-3 font-body-sm text-on-surface-variant">
        <p>
          This removes <strong className="!text-on-surface">{user.email}</strong> and every account they own. The
          person can no longer sign in.
        </p>
        <p className="rounded-lg bg-error/10 px-3 py-2 text-error">
          This cannot be undone. All of their invitations are erased along with stored photos, music, events, RSVPs
          and view history, plus their orders, sent emails, activity records and favorites.
        </p>
        <p>
          Type <code className="font-mono text-body-xs !text-on-surface">{expected}</code> to confirm.
        </p>
        <TextInput
          label="Confirmation"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={expected}
          autoComplete="off"
          disabled={busy}
        />
      </div>
    </Modal>
  );
}