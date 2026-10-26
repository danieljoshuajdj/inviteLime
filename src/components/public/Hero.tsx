import Link from "next/link";

import { HeroCarousel, type HeroCarouselImage } from "@/components/public/HeroCarousel";
import { HeroPreviewCard } from "@/components/public/HeroPreviewCard";
import { Icon } from "@/components/shared/Icon";

interface HeroData {
  title?: string;
  subtitle?: string;
  images?: HeroCarouselImage[];
}

const FALLBACK_TITLE = "Create a Breathtaking Wedding Website";

/**
 * The headline is stored as a single string in `site_settings.hero.title`
 * (e.g. "Create a Breathtaking Wedding Website"), so the trailing accent
 * phrase is split onto its own line. Appending a hardcoded "Wedding Website"
 * to a full CMS title is what made the phrase render twice.
 */
function headlineLines(title?: string): [string, string | null] {
  const text = (title ?? "").trim() || FALLBACK_TITLE;
  const accent = "Wedding Website";
  const at = text.toLowerCase().lastIndexOf(accent.toLowerCase());
  if (at <= 0) return [text, null];
  const lead = text.slice(0, at).trim();
  if (!lead) return [text, null];
  return [lead, text.slice(at).trim() || accent];
}

export function Hero({ title, subtitle, images = [] }: HeroData) {
  const [headlineLead, headlineAccent] = headlineLines(title);

  return (
    <section className="relative overflow-hidden bg-ivory-50">
      {/* decorative gradient blobs */}
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-navy-400/20 blur-[120px]" />
      <div className="pointer-events-none absolute -left-32 top-64 h-[420px] w-[420px] rounded-full bg-sapphire-300/25 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-[320px] w-[320px] rounded-full bg-rose-200/30 blur-[100px]" />
      <div className="relative mx-auto max-w-7xl px-4 pb-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        {/* Headline */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-navy-300/40 bg-ivory-100 px-4 py-1.5 font-body-xs font-semibold text-navy-950">
            <span className="h-2 w-2 rounded-full bg-gold-400" />
            Trusted for 5,00,000+ happy couples
          </p>

          <h1 className="font-heading-2xl !tracking-tight text-ivory-950 sm:font-heading-3xl">
            {headlineLead}
            {headlineAccent && (
              <>
                <br />
                <span className="text-sapphire-700">{headlineAccent}</span>
              </>
            )}
          </h1>
        </div>

        {/* Invitation preview carousel — immediately below the title. Falls back
            to the static mockup when `src/assets` has no imagery yet. */}
        <div className="relative mx-auto mt-8 w-full max-w-md lg:mt-10">
          {images.length > 0 ? <HeroCarousel images={images} /> : <HeroPreviewCard />}

          {/* Entry point, directly below the carousel. */}
          <div className="mt-8">
            <Link
              href="/templates"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ivory-950 px-6 font-body-md font-semibold text-ivory-50 shadow-lg shadow-ivory-950/20 transition-transform hover:scale-[1.02]"
            >
              Create your invitation
              <Icon name="arrow_forward" size="sm" />
            </Link>
          </div>
          <p className="mt-3 text-center font-body-xs text-navy-600">
            Free to design, pay only when you publish.
          </p>
        </div>

        {/* Supporting copy, below the hero actions */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto mt-10 max-w-xl font-body-lg leading-relaxed text-navy-800">
            {subtitle ||
              "Design an enchanting digital invitation in minutes. Choose from couture animated templates, add your ceremonies, music, and registry, and share a personalized link that opens instantly on every smartphone."}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <p className="flex items-center gap-1.5 font-body-sm font-medium text-navy-800">
              <Icon name="check_circle" size="sm" className="text-gold-500" /> No-code personal editor
            </p>
            <p className="flex items-center gap-1.5 font-body-sm font-medium text-navy-800">
              <Icon name="check_circle" size="sm" className="text-gold-500" /> Works on every phone
            </p>
            <p className="flex items-center gap-1.5 font-body-sm font-medium text-navy-800">
              <Icon name="check_circle" size="sm" className="text-gold-500" /> RSVP &amp; updates in one link
            </p>
          </div>
        </div>
      </div>

      {/* scroll hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 sm:block">
        <Icon name="keyboard_arrow_down" size="lg" className="animate-bounce text-navy-400" />
      </div>
    </section>
  );
}