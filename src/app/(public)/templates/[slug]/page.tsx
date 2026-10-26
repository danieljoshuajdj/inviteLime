import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/shared/Badge";
import { createServerClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/services/templates";
import { TemplateFavoriteButton } from "@/components/public/TemplateFavoriteButton";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerClient();
  const t = await getTemplateBySlug(supabase, slug);
  return {
    title: t ? t.name : "Template",
    description: t?.description ?? undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const t = await getTemplateBySlug(supabase, slug);
  if (!t) notFound();

  const price = quoteForTemplate(t, await getRequestCurrency()).label;

  return (
    <div className="pt-6 pb-12 lg:pt-8 lg:pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* breadcrumb */}
        <nav className="flex items-center gap-1.5 font-body-xs text-navy-600">
          <Link href="/templates" className="hover:underline">Templates</Link>
          <Icon name="chevron_right" size="sm" className="!text-[14px]" />
          <span className="font-medium text-navy-950">{t.name}</span>
        </nav>

        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Preview pane */}
          <div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-navy-200 bg-gradient-to-br from-sapphire-50 via-rose-50 to-gold-100 shadow-lg">
              {t.thumbnail_url ? (
                <img src={t.thumbnail_url} alt={t.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Icon name="auto_awesome" size="2xl" className="text-navy-400/50" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <Link
                  href={`/templates/${t.slug}/demo`}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-ivory-950/85 text-ivory-50 shadow-xl backdrop-blur transition-transform hover:scale-110"
                  aria-label={`Open the ${t.name} live demo`}
                >
                  <Icon name="play_circle" size="xl" weight="w500" />
                </Link>
              </div>
            </div>
          </div>

          {/* Info pane */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {(t.categories ?? []).map((c) => (
                <Badge key={c.id} tone="primary">{c.name}</Badge>
              ))}
            </div>
            <h1 className="mt-4 font-heading-3xl text-ivory-950">{t.name}</h1>
            <p className="mt-4 font-body-lg leading-relaxed text-navy-800">{t.description}</p>

            <div className="mt-0 rounded-2xl border border-navy-200 bg-ivory-50 p-6 sm:mt-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-body-xs uppercase tracking-widest text-navy-600">One-time license</p>
                  <p className="mt-1 font-heading-2xl text-sapphire-700">{price}</p>
                  <p className="mt-0.5 font-body-xs text-navy-600">inclusive of taxes · one-time license</p>
                </div>
                <Link href={`/create/new?template=${t.slug}`}>
                  <Button size="xl" icon="auto_awesome">Create</Button>
                </Link>
              </div>
              <div className="mt-5 flex flex-col gap-2 border-t border-navy-200 pt-4 font-body-sm text-navy-800">
                <p className="flex items-center gap-2"><Icon name="check_circle" size="sm" className="text-gold-500" /> Live until two months after your wedding date</p>
                <p className="flex items-center gap-2"><Icon name="check_circle" size="sm" className="text-gold-500" /> Unlimited events, guests, RSVPs &amp; photos</p>
                <p className="flex items-center gap-2"><Icon name="check_circle" size="sm" className="text-gold-500" /> Shareable link with personal guest names</p>
                <p className="flex items-center gap-2"><Icon name="check_circle" size="sm" className="text-gold-500" /> Edit names, photos and venues anytime — your link never changes</p>
              </div>
            </div>

            <div className="mt-6 flex items-stretch gap-3">
              <Link href={`/templates/${t.slug}/demo`} className="flex min-w-0 flex-1">
                <Button variant="outline" size="lg" icon="play_circle" iconAfter="arrow_forward" fullWidth>
                  Demo
                </Button>
              </Link>
              <TemplateFavoriteButton
                templateId={t.id}
                templateName={t.name}
                withLabel
                className="shrink-0 justify-center rounded-2xl border border-navy-200 px-4 py-3 font-body-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}