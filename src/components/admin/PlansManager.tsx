"use client";

import { useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { FieldWrap, TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";
import { formatPrice, slugify } from "@/lib/utils";

export interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPricePaise: number;
  yearlyPricePaise: number;
  currency: string;
  monthlyInvitationLimit: number | null;
  yearlyInvitationLimit: number | null;
  razorpayMonthlyPlanId: string | null;
  razorpayYearlyPlanId: string | null;
  active: boolean;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyLimit: string;
  yearlyLimit: string;
  razorpayMonthlyPlanId: string;
  razorpayYearlyPlanId: string;
  active: boolean;
}

const blankForm: FormState = {
  name: "",
  slug: "",
  description: "",
  monthlyPrice: "",
  yearlyPrice: "",
  monthlyLimit: "",
  yearlyLimit: "",
  razorpayMonthlyPlanId: "",
  razorpayYearlyPlanId: "",
  active: true,
};

function formFromPlan(plan: AdminPlan): FormState {
  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? "",
    monthlyPrice: String(plan.monthlyPricePaise / 100),
    yearlyPrice: String(plan.yearlyPricePaise / 100),
    monthlyLimit: plan.monthlyInvitationLimit === null ? "" : String(plan.monthlyInvitationLimit),
    yearlyLimit: plan.yearlyInvitationLimit === null ? "" : String(plan.yearlyInvitationLimit),
    razorpayMonthlyPlanId: plan.razorpayMonthlyPlanId ?? "",
    razorpayYearlyPlanId: plan.razorpayYearlyPlanId ?? "",
    active: plan.active,
  };
}

function parseLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function toPaise(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

export function PlansManager({ initialPlans }: { initialPlans: AdminPlan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [editing, setEditing] = useState<AdminPlan | "new" | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Once the admin types their own slug, stop overwriting it from the name.
  // Existing plans start "touched" so an edit never silently changes a slug.
  const [slugTouched, setSlugTouched] = useState(false);

  function openNew() {
    setForm(blankForm);
    setSlugTouched(false);
    setEditing("new");
  }

  function openEdit(plan: AdminPlan) {
    setForm(formFromPlan(plan));
    setSlugTouched(true);
    setEditing(plan);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateName(value: string) {
    setForm((f) => ({
      ...f,
      name: value,
      ...(slugTouched ? {} : { slug: slugify(value) }),
    }));
  }

  function updateSlug(value: string) {
    setSlugTouched(value.trim().length > 0);
    update("slug", value);
  }

  async function save() {
    if (!form.name.trim()) {
      toast("Plan needs a name");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        description: form.description.trim() || null,
        monthlyPricePaise: toPaise(form.monthlyPrice),
        yearlyPricePaise: toPaise(form.yearlyPrice),
        currency: editing === "new" ? "INR" : (editing as AdminPlan).currency,
        monthlyInvitationLimit: parseLimit(form.monthlyLimit),
        yearlyInvitationLimit: parseLimit(form.yearlyLimit),
        razorpayMonthlyPlanId: form.razorpayMonthlyPlanId.trim() || null,
        razorpayYearlyPlanId: form.razorpayYearlyPlanId.trim() || null,
        active: form.active,
      };
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/admin/plans" : `/api/admin/plans/${(editing as AdminPlan).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { plan?: { id: string }; error?: string };
      if (!res.ok || !json.plan) throw new Error(json.error ?? "Could not save plan");

      const row: AdminPlan = {
        id: json.plan.id,
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        monthlyPricePaise: payload.monthlyPricePaise,
        yearlyPricePaise: payload.yearlyPricePaise,
        currency: payload.currency,
        monthlyInvitationLimit: payload.monthlyInvitationLimit,
        yearlyInvitationLimit: payload.yearlyInvitationLimit,
        razorpayMonthlyPlanId: payload.razorpayMonthlyPlanId,
        razorpayYearlyPlanId: payload.razorpayYearlyPlanId,
        active: payload.active,
      };
      setPlans((rows) =>
        isNew ? [...rows, row] : rows.map((p) => (p.id === row.id ? { ...p, ...row } : p))
      );
      setEditing(null);
      toast(isNew ? "Plan created" : "Plan updated");
    } catch (e) {
      toast("Could not save plan", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(plan: AdminPlan) {
    setBusy(plan.id);
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not deactivate plan");
      setPlans((rows) => rows.map((p) => (p.id === plan.id ? { ...p, active: false } : p)));
      toast("Plan deactivated", "Existing subscribers keep their current period.");
    } catch (e) {
      toast("Could not deactivate", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Planner billing</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Plans</h1>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            Packages sell invitation websites to planners. A blank invitation limit means unlimited.
          </p>
        </div>
        <Button icon="add" onClick={openNew}>
          New plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-outline-variant p-12 text-center">
          <Icon name="workspace_premium" size="xl" className="mx-auto text-on-surface-variant" />
          <p className="mt-3 font-body-sm text-on-surface-variant">No planner plans yet.</p>
          <Button className="mt-4" icon="add" onClick={openNew}>
            Create the first plan
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="rounded-2xl border border-outline-variant bg-surface-container-low p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading-lg !text-on-surface">{plan.name}</h2>
                  <p className="font-body-xs text-on-surface-variant">{plan.slug}</p>
                </div>
                <Badge tone={plan.active ? "success" : "default"} icon={plan.active ? "check_circle" : "info"}>
                  {plan.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {plan.description && (
                <p className="mt-2 font-body-sm text-on-surface-variant">{plan.description}</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface p-3">
                  <p className="font-body-xs uppercase tracking-widest text-on-surface-variant">Monthly</p>
                  <p className="mt-1 font-heading-lg !text-on-surface">
                    {formatPrice(plan.monthlyPricePaise, plan.currency)}
                  </p>
                  <p className="font-body-xs text-on-surface-variant">
                    {plan.monthlyInvitationLimit === null
                      ? "Unlimited invitations"
                      : `${plan.monthlyInvitationLimit} invitations`}
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="font-body-xs uppercase tracking-widest text-on-surface-variant">Yearly</p>
                  <p className="mt-1 font-heading-lg !text-on-surface">
                    {formatPrice(plan.yearlyPricePaise, plan.currency)}
                  </p>
                  <p className="font-body-xs text-on-surface-variant">
                    {plan.yearlyInvitationLimit === null
                      ? "Unlimited invitations"
                      : `${plan.yearlyInvitationLimit} invitations`}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" icon="edit" onClick={() => openEdit(plan)}>
                  Edit
                </Button>
                {plan.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="block"
                    loading={busy === plan.id}
                    onClick={() => void deactivate(plan)}
                  >
                    Deactivate
                  </Button>
                )}
                <span className="ml-auto font-body-xs text-on-surface-variant">
                  Razorpay: {plan.razorpayMonthlyPlanId ? "monthly set" : "monthly not set"} ·{" "}
                  {plan.razorpayYearlyPlanId ? "yearly set" : "yearly not set"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === "new" ? "New planner plan" : "Edit planner plan"}
        icon="workspace_premium"
        size="lg"
        blockBackdropClose={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              {editing === "new" ? "Create plan" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Plan name"
              value={form.name}
              onChange={(e) => updateName(e.target.value)}
              placeholder="Studio Pro"
              required
            />
            <TextInput
              label="Slug"
              hint="Used in Razorpay notes and internal links. Auto-filled from the name for new plans."
              value={form.slug}
              onChange={(e) => updateSlug(e.target.value)}
              placeholder="studio-pro"
            />
          </div>
          <FieldWrap label="Description" hint="Shown to planners on the plan screen.">
            <textarea
              className="min-h-20 w-full rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5 font-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Unlimited invitations, studio branding and priority support."
            />
          </FieldWrap>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Monthly price (₹)"
              type="number"
              min="0"
              step="0.01"
              value={form.monthlyPrice}
              onChange={(e) => update("monthlyPrice", e.target.value)}
              placeholder="2499"
            />
            <TextInput
              label="Yearly price (₹)"
              type="number"
              min="0"
              step="0.01"
              value={form.yearlyPrice}
              onChange={(e) => update("yearlyPrice", e.target.value)}
              placeholder="24990"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Monthly invitation limit"
              hint="Leave blank for unlimited."
              type="number"
              min="1"
              value={form.monthlyLimit}
              onChange={(e) => update("monthlyLimit", e.target.value)}
              placeholder="Unlimited"
            />
            <TextInput
              label="Yearly invitation limit"
              hint="Leave blank for unlimited."
              type="number"
              min="1"
              value={form.yearlyLimit}
              onChange={(e) => update("yearlyLimit", e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Razorpay monthly plan ID"
              hint="Optional. Required for self-serve monthly checkout."
              value={form.razorpayMonthlyPlanId}
              onChange={(e) => update("razorpayMonthlyPlanId", e.target.value)}
              placeholder="plan_..."
            />
            <TextInput
              label="Razorpay yearly plan ID"
              hint="Optional. Required for self-serve yearly checkout."
              value={form.razorpayYearlyPlanId}
              onChange={(e) => update("razorpayYearlyPlanId", e.target.value)}
              placeholder="plan_..."
            />
          </div>
          <label className="flex items-center gap-2 font-body-sm text-on-surface">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => update("active", e.target.checked)}
            />
            Active and available to planners
          </label>
        </div>
      </Modal>
    </div>
  );
}
