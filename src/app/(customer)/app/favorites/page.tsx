import type { Metadata } from "next";
import Link from "next/link";

import { createServerClient } from "@/lib/supabase/server";
import { storagePublicUrl } from "@/lib/services/templates";
import { ExploreGrid } from "@/components/account/ExploreGrid";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";
import { getPlannerBrand, isPlannerBrandComplete } from "@/lib/services/planner-branding";
import { Button } from "@/components/shared/Button";

export const metadata: Metadata = { title: "Favorites" };

export default async function FavoritesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let favorites: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    thumbnail_url?: string | null;
    thumbnail_path?: string | null;
    product?: {
      price_paise?: number;
      currency?: string;
      prices?: Array<{ currency: string; amount_minor: number; active: boolean }>;
    } | null;
    template_categories?: Array<{ category: { name: string } }>;
  }> = [];
  try {
    const { data } = await supabase
      .from("favorite_templates")
      // `template_categories` is the template↔category join table; the category
      // itself hangs off it as `categories`. Naming a bare `category` column made
      // PostgREST reject the whole embed (PGRST200), which silently emptied this
      // page for every account, including planners.
      .select(`template_id, template:template_id(id, name, slug, description, thumbnail_path, product:product_id(id, price_paise, currency, prices:product_prices(currency, amount_minor, active)), template_categories:template_categories(category:categories(name)))`)
      .eq("user_id", user?.id ?? "");
    favorites = ((data ?? []) as Array<{ template_id: string; template: any }>).map((r) => r.template).filter(Boolean);
  } catch {
    favorites = [];
  }

  const currency = await getRequestCurrency();

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
      <div>
        <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Saved for later</p>
        <h1 className="mt-1 font-heading-2xl !text-on-surface">Favorite templates</h1>
        <p className="mt-1 font-body text-on-surface-variant">Templates you hearted while exploring.</p>
      </div>

      {favorites.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-outline-variant p-12 text-center">
          <h2 className="font-heading-md font-semibold !text-on-surface">Nothing saved yet</h2>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            Tap the ♥ on any template in the library to keep it here.
          </p>
          <Link href="/app/explore" className="mt-5 inline-flex">
            <Button icon="storefront">Browse the library</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <ExploreGrid
            templates={favorites.map((t: any) => {
              const { label, payable } = quoteForTemplate(
                {
                  price_paise: t.product?.price_paise ?? 0,
                  currency: t.product?.currency ?? "INR",
                  prices: t.product?.prices ?? [],
                },
                currency
              );
              return {
                id: t.id,
                slug: t.slug,
                name: t.name,
                description: t.description,
                thumbnailUrl: t.thumbnail_path ? storagePublicUrl("templates", t.thumbnail_path) : null,
                priceLabel: payable ? label : "Free preview",
                categories: t.template_categories?.map((tc: any) => tc.category.name) ?? [],
              };
            })}
            initialFavorites={favorites.map((f) => f.id)}
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
      )}
    </div>
  );
}