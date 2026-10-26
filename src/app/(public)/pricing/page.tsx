import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/shared/Badge";
import { createServerClient } from "@/lib/supabase/server";
import { listActiveTemplates } from "@/lib/services/templates";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";
import { formatPrice } from "@/lib/utils";
import { listPlannerPlans } from "@/lib/services/planner-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple one-time pricing for couture wedding invitation templates. Pay once, own it forever. Includes hosting, reserved link and guest RSVPs.",
};

const editions = [
  {
    name: "Silver Keepsake",
    tagline: "Perfect for intimate celebrations",
    price: "From ₹2,499",
    features: [
      "1 signature template license",
      "Reserved personal link",
      "Photo gallery & couple story",
      "Guest RSVP tracker",
      "4 user accounts",
    ],
    highlight: false,
  },
  {
    name: "Gold Atelier",
    tagline: "Most loved for full-family weddings",
    price: "From ₹3,999",
    features: [
      "Everything in Silver",
      "Multi-event schedules (Sangeet, Mehendi…)",
      "Wedding music & cinematic reveal",
      "WhatsApp invitations with names",
      "RSVP updates broadcast",
      "Travel & stay guide pages",
    ],
    highlight: true,
  },
  {
    name: "Haute Couture",
    tagline: "Opulent suites for grand affairs",
    price: "From ₹5,499",
    features: [
      "Everything in Gold",
      "Video & drone showcase pages",
      "Numerology & auspicious time cards",
      "Designer QR cards download",
      "Concierge support",
    ],
    highlight: false,
  },
];

export default async function PricingPage() {
  const currency = await getRequestCurrency();
  // Floor shown only when the catalogue is unreachable; in the home market.
  let minLabel = formatPrice(249900, "INR");
  const plannerPlans = await listPlannerPlans({ includeInactive: false }).catch(() => []);
  try {
    const supabase = await createServerClient();
    const templates = await listActiveTemplates(supabase);
    const payable = templates
      .map((t) => quoteForTemplate(t, currency))
      .filter((q) => q.payable);
    if (payable.length) {
      minLabel = payable.reduce((a, b) => (b.quote.amountMinor < a.quote.amountMinor ? b : a)).label;
    }
  } catch {
    // keep the documented floor
  }

  return (
    <div className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">Simple pricing</p>
          <h1 className="mt-3 font-heading-3xl text-ivory-950">Pay once. Own it forever.</h1>
          <p className="mt-5 font-body-lg text-navy-800">
            For couples, every template is a one-time license priced from{" "}
            <strong className="text-sapphire-700">{minLabel}</strong> including taxes. No recurring fees,
            no hidden charges — hosting, updates and guest RSVPs are all included.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {editions.map((e) => (
            <div
              key={e.name}
              className={
                "relative flex flex-col rounded-3xl border p-7 " +
                (e.highlight
                  ? "border-sapphire-700 bg-ivory-950 text-ivory-50 shadow-2xl shadow-sapphire-900/30"
                  : "border-navy-200 bg-ivory-50 text-navy-950")
              }
            >
              {e.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge tone="gold" className="!bg-gold-400 !text-ivory-950 shadow">Most popular</Badge>
                </span>
              )}
              <h2 className="font-heading-lg">{e.name}</h2>
              <p className={"mt-1 font-body-sm " + (e.highlight ? "text-ivory-300" : "text-navy-700")}>{e.tagline}</p>
              <p className={"mt-6 font-heading-2xl " + (e.highlight ? "text-gold-300" : "text-sapphire-700")}>{e.price}</p>
              <ul className="mt-6 flex flex-col gap-3 font-body-sm">
                {e.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Icon name="check_circle" size="sm" className={e.highlight ? "mt-0.5 text-gold-400" : "mt-0.5 text-gold-600"} />
                    <span className={e.highlight ? "text-ivory-100" : "text-navy-900"}>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 pt-2">
                <Link href="/templates" className="block">
                  <Button variant={e.highlight ? "secondary" : "primary"} size="lg" fullWidth icon="diamond">
                    Explore this edition
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center font-body-sm leading-relaxed text-navy-700">
          Prefer to customize before paying? Start for free — you only pay when you publish.
          Your deposit is refundable within 14 days if you decide Invite Lime is not for you.
        </p>

        {plannerPlans.length > 0 && (
          <section className="mt-20 border-t border-navy-200 pt-14">
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">
                For wedding planners
              </p>
              <h2 className="mt-3 font-heading-2xl text-ivory-950">Publish for every couple, under your studio.</h2>
              <p className="mt-4 font-body-md text-navy-800">
                Planner plans include branded invitation websites. Your studio name, phone, address and map
                appear on every invitation you publish — and plan-covered invitations skip per-invitation
                checkout.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
              {plannerPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex flex-col rounded-2xl border border-navy-200 bg-ivory-50 p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading-lg text-navy-950">{plan.name}</h3>
                      <p className="mt-1 font-body-sm text-navy-700">
                        {plan.description ?? "Branded invitations for your studio."}
                      </p>
                    </div>
                    <Badge tone="gold">{plan.currency}</Badge>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/70 p-3">
                      <p className="font-body-xs uppercase tracking-widest text-navy-600">Monthly</p>
                      <p className="mt-1 font-heading-lg text-sapphire-700">
                        {formatPrice(plan.monthly_price_paise, plan.currency)}
                      </p>
                      <p className="font-body-xs text-navy-600">
                        {plan.monthly_invitation_limit === null
                          ? "Unlimited invitations"
                          : `${plan.monthly_invitation_limit} invitations`}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/70 p-3">
                      <p className="font-body-xs uppercase tracking-widest text-navy-600">Yearly</p>
                      <p className="mt-1 font-heading-lg text-sapphire-700">
                        {formatPrice(plan.yearly_price_paise, plan.currency)}
                      </p>
                      <p className="font-body-xs text-navy-600">
                        {plan.yearly_invitation_limit === null
                          ? "Unlimited invitations"
                          : `${plan.yearly_invitation_limit} invitations`}
                      </p>
                    </div>
                  </div>
                  <Link href="/app/account/plan" className="mt-5 block">
                    <Button variant="secondary" fullWidth icon="workspace_premium">
                      Choose {plan.name}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center font-body-xs leading-relaxed text-navy-600">
              Plans cover new invitations only. An invitation that has already been published stays live until
              its own expiry, regardless of the plan status. Planners without an active plan can still buy a
              one-time invitation as a customer, without studio branding.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}