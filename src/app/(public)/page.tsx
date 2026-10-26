import type { Metadata } from "next";

import { Features } from "@/components/public/Features";
import { Hero } from "@/components/public/Hero";
import { PricingTeaser } from "@/components/public/PricingTeaser";
import { TemplateShowcase } from "@/components/public/TemplateShowcase";
import { Workflow } from "@/components/public/Workflow";
import { FaqSection } from "@/components/public/FaqSection";
import { getPublicSiteData } from "@/lib/services/site-settings";
import { listHeroImages } from "@/lib/services/hero-images";
import { createServerClient } from "@/lib/supabase/server";
import { listActiveTemplates, type PublicTemplate } from "@/lib/services/templates";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";

export const metadata: Metadata = {
  title: "Haute Wedding Invitation Platform — Invite Lime",
  description:
    "Create a breathtaking wedding website with couture animated templates, multi-event schedules, RSVP tracking and a personalized link that opens on every phone.",
};

export default async function HomePage() {
  let site: Awaited<ReturnType<typeof getPublicSiteData>> | null = null;
  let settingsError = false;

  try {
    site = await getPublicSiteData();
  } catch {
    settingsError = true;
  }

  const hero = (site?.hero ?? {}) as { title?: string; subtitle?: string };
  const faq = (site?.faq ?? []) as Array<{ q: string; a: string }>;

  const showStats = (site?.marketing as { show_stats?: boolean } | undefined)?.show_stats;

  // Get carousel images from src/assets folder
  const heroImages = listHeroImages().slice(0, 5);

  // Featured templates for the showcase directly below the hero.
  let templates: PublicTemplate[] = [];
  try {
    const supabase = await createServerClient();
    templates = await listActiveTemplates(supabase);
  } catch {
    templates = [];
  }

  // Country-aware pricing: resolve the visitor's currency from trusted request
  // headers, then look up the explicit price for it (falls back safely).
  const currency = await getRequestCurrency();

  return (
    <>
      <Hero title={hero.title} subtitle={hero.subtitle} images={heroImages} />

      <TemplateShowcase
        templates={templates.map((t) => {
          const { label, payable } = quoteForTemplate(t, currency);
          return {
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

      {showStats && <BrandStats />}

      <Workflow />
      <Features />
      <PricingTeaser />
      <FaqSection faq={faq} />

      {settingsError && (
        <p className="sr-only">Site settings unavailable.</p>
      )}
    </>
  );
}

function BrandStats() {
  const stats = [
    { value: "5,00,000+", label: "Happy Couples" },
    { value: "4.9/5", label: "Average Rating" },
    { value: "M", label: "Minutes to Create" },
  ];
  return (
    <section className="border-y border-navy-200 bg-ivory-50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-heading-2xl !text-sapphire-700">{s.value}</p>
            <p className="mt-1 font-body-sm font-medium text-navy-700">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}