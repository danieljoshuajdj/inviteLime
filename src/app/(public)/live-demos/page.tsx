import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { createServerClient } from "@/lib/supabase/server";
import { listActiveTemplates, type PublicTemplate } from "@/lib/services/templates";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";
import { LiveDemoGrid } from "@/components/public/LiveDemoGrid";

export const metadata: Metadata = {
  title: "Live demos",
  description: "Open sample Invite Lime invitations live in your browser and see how they feel on your phone.",
};

export default async function LiveDemosPage() {
  let templates: PublicTemplate[] = [];
  try {
    const supabase = await createServerClient();
    templates = await listActiveTemplates(supabase);
  } catch {
    templates = [];
  }

  const demos: PublicTemplate[] = templates;
  const currency = await getRequestCurrency();

  return (
    <div className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">Live experiences</p>
          <h1 className="mt-3 font-heading-3xl text-ivory-950">Try before you buy</h1>
          <p className="mt-5 font-body-lg text-navy-800">
            Open any template as a live demo on your phone. These are fully working sample
            invitations — tap to open.
          </p>
        </div>

        {demos.length === 0 ? (
          <EmptyState
            icon="storefront"
            title="No live demos published yet"
            description="Demo links appear here as soon as the atelier publishes a template package. Browse the marketplace in the meantime."
            action={
              <Link href="/templates">
                <Button icon="grid_view">Browse templates</Button>
              </Link>
            }
            className="mt-12"
          />
        ) : (
          <LiveDemoGrid
            demos={demos.map((t) => {
              const { label, payable } = quoteForTemplate(t, currency);
              return {
                id: t.id,
                slug: t.slug,
                name: t.name,
                thumbnailUrl: t.thumbnail_url,
                priceLabel: label,
                payable,
              };
            })}
          />
        )}
      </div>
    </div>
  );
}