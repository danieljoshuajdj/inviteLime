import type { Metadata } from "next";

import { createServerClient } from "@/lib/supabase/server";
import { listActiveTemplates, type PublicTemplate } from "@/lib/services/templates";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";
import { getPlannerBrand, isPlannerBrandComplete } from "@/lib/services/planner-branding";
import { ExploreGrid } from "@/components/account/ExploreGrid";

export const metadata: Metadata = {
  title: "Explore templates",
};

export default async function ExplorePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let templates: PublicTemplate[] = [];
  let favorites: string[] = [];
  try {
    templates = await listActiveTemplates(supabase);
    const { data } = await supabase.from("favorite_templates").select("template_id");
    favorites = (data ?? []).map((r) => r.template_id);
  } catch {
    // offline fallback
  }

  const currency = await getRequestCurrency();

  // Planners preview the demo as it will look under their studio identity.
  // The toggle in the preview is only meaningful when a complete brand exists.
  const isPlanner =
    user
      ? (
          await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle()
        ).data?.role === "planner"
      : false;
  const brand = isPlanner && user
    ? await getPlannerBrand(user.id, supabase).catch(() => null)
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Template library</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Explore the atelier</h1>
          <p className="mt-1 font-body text-on-surface-variant">
            Open live demos, save favorites, and start personalizing right here.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ExploreGrid
          templates={templates.map((t) => {
            const { label, payable } = quoteForTemplate(t, currency);
            return {
              id: t.id,
              slug: t.slug,
              name: t.name,
              description: t.description,
              thumbnailUrl: t.thumbnail_url,
              priceLabel: payable ? label : "Free preview",
              categories: t.categories.map((c) => c.name),
            };
          })}
          initialFavorites={favorites}
          userId={user?.id ?? ""}
          isPlanner={isPlanner}
          plannerBrand={
            brand && isPlannerBrandComplete(brand)
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