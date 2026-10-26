import type { Metadata } from "next";

import { createServerClient } from "@/lib/supabase/server";
import { listActiveTemplates, type PublicTemplate } from "@/lib/services/templates";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";
import { TemplatesMarketplace } from "@/components/public/TemplatesMarketplace";

export const metadata: Metadata = {
  title: "Template Library",
  description:
    "Browse couture animated wedding invitation templates. Open live demos on your phone, personalize, and publish with a reserved link.",
};

export default async function TemplatesPage() {
  const currency = await getRequestCurrency();
  let templates: PublicTemplate[] = [];
  let categories: string[] = [];
  try {
    const supabase = await createServerClient();
    templates = await listActiveTemplates(supabase);
    // The filter chips mirror the admin-managed taxonomy, so creating,
    // renaming or deleting a category shows up here without a code change.
    const { data } = await supabase.from("categories").select("name").order("name");
    categories = ((data ?? []) as Array<{ name: string }>).map((c) => c.name);
  } catch {
    templates = [];
    categories = [];
  }

  return (
    <TemplatesMarketplace
      categories={categories}
      templates={templates.map((t) => {
        const { label, payable } = quoteForTemplate(t, currency);
        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description,
          priceLabel: payable ? label : "Free preview",
          priceSuffix: payable ? " onwards" : undefined,
          thumbnailUrl: t.thumbnail_url,
          categories: t.categories.map((c) => c.name),
        };
      })}
    />
  );
}