"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { toast } from "@/components/account/toast";
import { cn, formatDate, formatPrice } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  monthlyPricePaise: number;
  yearlyPricePaise: number;
  currency: string;
  monthlyInvitationLimit: number | null;
  yearlyInvitationLimit: number | null;
}

interface Entitlement {
  active: boolean;
  planName: string | null;
  billingCycle: "monthly" | "yearly" | null;
  status: string | null;
  endsAt: string | null;
  used: number;
  limit: number | null;
  source: string | null;
  cancelAtPeriodEnd: boolean;
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function usageText(entitlement: Entitlement) {
  if (entitlement.limit === null) return `${entitlement.used} published · unlimited plan`;
  return `${entitlement.used} of ${entitlement.limit} invitations used`;
}

export function PlannerPlanPanel({
  plans,
  entitlement,
  brandComplete,
  billingConfigured,
  email,
}: {
  plans: Plan[];
  entitlement: Entitlement;
  brandComplete: boolean;
  billingConfigured: boolean;
  email: string;
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState<string | null>(null);

  async function checkout(plan: Plan) {
    setBusy(plan.id);
    try {
      const res = await fetch("/api/planner/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, billingCycle: cycle }),
      });
      const json = (await res.json()) as {
        subscriptionId?: string;
        keyId?: string;
        error?: string;
      };
      if (!res.ok || !json.subscriptionId) throw new Error(json.error ?? "Could not start subscription");
      if (!window.Razorpay) throw new Error("The Razorpay checkout script is still loading. Please retry.");

      new window.Razorpay({
        key: json.keyId,
        subscription_id: json.subscriptionId,
        name: "Invite Lime Atelier",
        description: `${plan.name} · ${cycle} Planner Plan`,
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verify = await fetch("/api/planner/subscribe/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const body = (await verify.json()) as { error?: string };
            if (!verify.ok) throw new Error(body.error ?? "Subscription could not be verified");
            toast("Planner Plan active", "You can now publish branded invitations.");
            router.refresh();
          } catch (e) {
            toast("Subscription verification failed", (e as Error).message);
          }
        },
        modal: {
          ondismiss: () => setBusy(null),
          confirm_close: true,
        },
        prefill: { email },
        theme: { color: "#000000" },
      }).open();
    } catch (e) {
      toast("Could not start checkout", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      const res = await fetch("/api/planner/subscribe/cancel", { method: "POST" });
      const json = (await res.json()) as { error?: string; endsAt?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not cancel");
      toast("Cancellation scheduled", `You keep plan access until ${json.endsAt ? formatDate(json.endsAt) : "the period ends"}.`);
      router.refresh();
    } catch (e) {
      toast("Could not cancel", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (entitlement.active) {
    const limited = entitlement.limit !== null;
    const pct = limited && entitlement.limit! > 0 ? Math.min((entitlement.used / entitlement.limit!) * 100, 100) : 0;
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-body-xs font-semibold uppercase tracking-[0.18em] text-secondary">Current plan</p>
              <h2 className="mt-1 font-heading-xl !text-on-surface">{entitlement.planName}</h2>
              <p className="mt-1 font-body-sm text-on-surface-variant">
                {entitlement.billingCycle} · {entitlement.source === "razorpay" ? "billed by Razorpay" : "assigned by the studio"}
              </p>
            </div>
            <Badge tone={entitlement.cancelAtPeriodEnd ? "warning" : "success"} icon="workspace_premium">
              {entitlement.cancelAtPeriodEnd ? "Cancels at period end" : "Active"}
            </Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface p-4">
              <p className="font-body-xs uppercase tracking-widest text-on-surface-variant">Renews / ends</p>
              <p className="mt-1 font-body-sm font-semibold text-on-surface">
                {entitlement.endsAt ? formatDate(entitlement.endsAt) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-body-xs uppercase tracking-widest text-on-surface-variant">Invitation usage</p>
                <p className="font-body-xs text-on-surface-variant">{usageText(entitlement)}</p>
              </div>
              {limited ? (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-highest">
                  <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${pct}%` }} />
                </div>
              ) : (
                <p className="mt-2 font-body-sm text-on-surface-variant">No cap on new invitations this period.</p>
              )}
            </div>
          </div>

          {!brandComplete && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
              <p className="font-body-sm text-on-surface">Add your brand details before publishing a branded invitation.</p>
              <Link href="/app/account/brand" className="font-body-sm font-semibold text-secondary underline">
                Open Brand details
              </Link>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-outline-variant pt-4">
            {entitlement.source === "razorpay" && !entitlement.cancelAtPeriodEnd && (
              <Button variant="outline" size="sm" loading={busy === "cancel"} onClick={() => void cancel()}>
                Cancel at period end
              </Button>
            )}
            <p className="font-body-xs text-on-surface-variant">
              Already-published invitations stay live until their own expiry, even after the plan ends.
            </p>
          </div>
        </div>

        <p className="flex gap-2 font-body-xs text-on-surface-variant">
          <Icon name="info" size="sm" className="mt-0.5 shrink-0" />
          Need more invitations or a different package? Contact the studio to change your plan without losing
          already-published work.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Script id="razorpay-checkout" src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading-lg !text-on-surface">Choose a Planner Plan</h2>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            Publish branded invitation websites for your clients. Plans cover new invitations;
            delivered invitations always keep their own expiry.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-outline-variant bg-surface p-1">
          <button
            type="button"
            className={cn(
              "rounded-full px-4 py-1.5 font-body-sm font-semibold",
              cycle === "monthly" ? "bg-primary text-on-primary" : "text-on-surface-variant"
            )}
            onClick={() => setCycle("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-4 py-1.5 font-body-sm font-semibold",
              cycle === "yearly" ? "bg-primary text-on-primary" : "text-on-surface-variant"
            )}
            onClick={() => setCycle("yearly")}
          >
            Yearly
          </button>
        </div>
      </div>

      {!billingConfigured && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-body-sm text-on-surface">
          Self-serve checkout is not configured yet. Contact the studio to have a plan assigned to your account.
        </div>
      )}

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant p-10 text-center">
          <Icon name="workspace_premium" size="xl" className="mx-auto text-on-surface-variant" />
          <p className="mt-3 font-body-sm text-on-surface-variant">Planner plans are being prepared. Contact the studio.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => {
            const price = cycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
            const limit = cycle === "monthly" ? plan.monthlyInvitationLimit : plan.yearlyInvitationLimit;
            return (
              <article key={plan.id} className="flex flex-col rounded-2xl border border-outline-variant bg-surface-container-low p-5">
                <h3 className="font-heading-lg !text-on-surface">{plan.name}</h3>
                <p className="mt-1 min-h-5 font-body-sm text-on-surface-variant">{plan.description ?? "Branded invitations for your studio."}</p>
                <p className="mt-4 font-heading-2xl !text-on-surface">
                  {formatPrice(price, plan.currency)}
                  <span className="font-body-sm font-normal text-on-surface-variant"> / {cycle === "monthly" ? "month" : "year"}</span>
                </p>
                <ul className="mt-4 space-y-2 font-body-sm text-on-surface-variant">
                  <li className="flex items-start gap-2">
                    <Icon name="check_circle" size="sm" className="mt-0.5 text-success" />
                    {limit === null ? "Unlimited invitations" : `${limit} invitations per ${cycle === "monthly" ? "month" : "year"}`}
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check_circle" size="sm" className="mt-0.5 text-success" />
                    Studio branding on cover, navbar and footer
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check_circle" size="sm" className="mt-0.5 text-success" />
                    No per-invitation checkout for plan-covered work
                  </li>
                </ul>
                <Button
                  className="mt-5"
                  fullWidth
                  icon="workspace_premium"
                  loading={busy === plan.id}
                  disabled={!billingConfigured}
                  onClick={() => void checkout(plan)}
                >
                  Choose {plan.name}
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
