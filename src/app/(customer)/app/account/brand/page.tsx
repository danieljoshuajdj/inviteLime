import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";
import { getPlannerBrand } from "@/lib/services/planner-branding";
import { getPlannerEntitlement } from "@/lib/services/planner-plans";
import { AccountTabs } from "@/components/account/AccountTabs";
import { BrandDetailsForm } from "@/components/account/BrandDetailsForm";

export const metadata: Metadata = { title: "Brand details" };
export const dynamic = "force-dynamic";

export default async function BrandDetailsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/account/brand");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "planner") redirect("/app/account");

  const [brand, entitlement] = await Promise.all([
    getPlannerBrand(user.id).catch(() => null),
    getPlannerEntitlement(user.id).catch(() => null),
  ]);

  return (
    <div>
      <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Planner</p>
      <h1 className="mt-1 font-heading-2xl !text-on-surface">Brand details</h1>
      <div className="mt-5">
        <AccountTabs active="brand" isPlanner />
      </div>

      {!entitlement?.active && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <p className="font-body-sm text-on-surface">
            You can save your brand now, but publishing under a plan needs an active Planner Plan.
          </p>
          <Link href="/app/account/plan" className="font-body-sm font-semibold text-secondary underline">
            View plans
          </Link>
        </div>
      )}

      <div className="mt-6">
        <BrandDetailsForm
          initial={
            brand
              ? {
                  brandName: brand.brandName,
                  contactPhone: brand.contactPhone,
                  address: brand.address,
                  mapsUrl: brand.mapsUrl,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
