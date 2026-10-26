import type { Metadata } from "next";

import { TemplatePicker } from "@/components/builder/TemplatePicker";
import { createServerClient } from "@/lib/supabase/server";
import { listActiveTemplates, type PublicTemplate } from "@/lib/services/templates";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";
import { Icon } from "@/components/shared/Icon";

export const metadata: Metadata = {
  title: "Choose a template",
  description: "Pick a couture template for your wedding invitation.",
};

export default async function BrowseTemplatesPage() {
  const currency = await getRequestCurrency();
  let templates: PublicTemplate[] = [];
  try {
    const supabase = await createServerClient();
    templates = await listActiveTemplates(supabase);
  } catch {
    templates = [];
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="flex items-center gap-2 font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">
          <Icon name="diamond" size="sm" /> Start with a template
        </p>
        <h1 className="mt-3 font-heading-3xl text-ivory-950">Choose your signature template</h1>
        <p className="mt-3 max-w-2xl font-body-lg text-navy-800">
          Every template is a full interactive suite you can personalize on any device.
          Personalization is free — you only decide after seeing your live preview.
        </p>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-navy-300 p-10 text-center font-body text-navy-700">
          Templates will appear here once the database is connected.
        </p>
      ) : (
        <TemplatePicker
          templates={templates.map((t) => {
            const { label, payable } = quoteForTemplate(t, currency);
            return {
              slug: t.slug,
              name: t.name,
              description: t.description,
              priceLabel: payable ? `${label} · one-time` : "Free preview",
              thumbnailUrl: t.thumbnail_url,
              categories: t.categories.map((c) => c.name),
            };
          })}
        />
      )}
    </div>
  );
}