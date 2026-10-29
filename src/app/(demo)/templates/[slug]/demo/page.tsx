import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { TemplateFrame } from "@/components/runtime/TemplateFrame";
import { createServerClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/services/templates";
import { loadDemoRuntime } from "@/lib/services/template-runtime";
import { buildRuntimePayload } from "@/lib/runtime/payload";
import {
  DEMO_WEDDING_DATA,
  demoDetailsToRuntimeExtras,
  demoDetailsToWeddingData,
  weddingDataToRuntimeInput,
  withDemoMusic,
  withPackMedia,
} from "@/lib/services/demo-wedding";
import { getDemoDetailPack } from "@/lib/services/demo-details";
import { getPackDemoMedia } from "@/lib/services/media-packs";
import { getMusicTrack } from "@/lib/services/music-library";
import { absolutizeMediaUrl, rewriteRuntimeMedia } from "@/lib/services/media-urls";
import {
  getPlannerBrand,
  isPlannerBrandComplete,
  normalizeMapsUrl,
} from "@/lib/services/planner-branding";
import {
  categorySlugForFormType,
  formTypeOrDefault,
  isBirthdayForm,
} from "@/lib/builder/forms";
import { musicTrackInCategory } from "@/lib/library-media";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string | string[]; branding?: string | string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const supabase = await createServerClient();
    const t = await getTemplateBySlug(supabase, slug);
    return {
      title: t ? `${t.name} — live demo` : "Template demo",
      description: t?.description ?? "Preview this Invite Lime invitation template in demo mode.",
    };
  } catch {
    return { title: "Template demo" };
  }
}

/**
 * DEMO MODE — the same runtime the live invitation uses, booted with an
 * explicit demo dataset instead of customer data. Nothing here is persisted.
 *
 * This route deliberately lives outside the `(public)` group so it inherits the
 * root layout only. Route groups do not appear in the URL, so the public path
 * `/templates/[slug]/demo` is unchanged; the demo simply no longer renders the
 * marketing nav and footer around the template.
 */
export default async function TemplateDemoPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { embed, branding } = await searchParams;
  // The planner's Explore page opens this route inside a preview dialog. Hide
  // the standalone "Demo / Exit demo" chrome there; the dialog owns those
  // controls and the exit link would otherwise navigate inside the iframe.
  const embedded = embed === "1";
  const supabase = await createServerClient();
  const template = await getTemplateBySlug(supabase, slug).catch(() => null);
  if (!template || template.status !== "active") notFound();

  // `branding=1` is only ever meaningful for the signed-in planner previewing
  // their own template library. Fetching with the request-scoped client means
  // RLS only exposes that planner's own studio row.
  let plannerBrand: {
    brandName: string;
    contactPhone: string;
    address: string | null;
    mapsUrl: string | null;
  } | null = null;
  if (branding === "1") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role === "planner") {
        const brand = await getPlannerBrand(user.id, supabase).catch(() => null);
        if (isPlannerBrandComplete(brand)) {
          plannerBrand = {
            brandName: brand.brandName,
            contactPhone: brand.contactPhone,
            address: brand.address,
            mapsUrl: normalizeMapsUrl(brand.mapsUrl),
          };
        }
      }
    }
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const demoUrl = `${appUrl}/templates/${template.slug}/demo`;

  // Three independent demo layers, each assigned at template upload:
  //   details → who/what the demo is about (names, venue, events, dress code)
  //   media   → photos for the bride/groom/couple and gallery slots
  //   music   → one background song from the shared library
  // A layer authored for a different category is ignored: a birthday demo must
  // never render a wedding pack, and a track offered only in another category
  // must not leak into this category's demo. A failed lookup (or content
  // deleted since assignment) degrades to the stock demo rather than breaking
  // the page.
  const formType = formTypeOrDefault(template.form_type);
  const categorySlug = template.categories[0]?.slug ?? categorySlugForFormType(formType);
  const [packMedia, detailCandidate, trackCandidate] = await Promise.all([
    template.media_pack_id
      ? getPackDemoMedia(template.media_pack_id, formType).catch(() => null)
      : Promise.resolve(null),
    template.demo_detail_pack_id
      ? getDemoDetailPack(template.demo_detail_pack_id).catch(() => null)
      : Promise.resolve(null),
    template.music_track_id
      ? getMusicTrack(template.music_track_id).catch(() => null)
      : Promise.resolve(null),
  ]);
  const detailPack = detailCandidate?.formType === formType ? detailCandidate : null;
  const track =
    trackCandidate && musicTrackInCategory(trackCandidate, categorySlug) ? trackCandidate : null;

  const baseData = detailPack ? demoDetailsToWeddingData(detailPack) : DEMO_WEDDING_DATA;
  const withPhotos = packMedia ? withPackMedia(baseData, packMedia) : baseData;
  const layered = track ? withDemoMusic(withPhotos, track) : withPhotos;

  // The template's category decides which form the demo shows. A birthday
  // template reuses the stock demo photos as its main image and has no RSVP.
  const birthday = isBirthdayForm(formType);
  const demoData = birthday
    ? {
        ...layered,
        formType,
        celebrantName: layered.celebrantName || "Ananya",
        birthdayNumber:
          formType === "birthday_wishes" ? layered.birthdayNumber ?? 21 : layered.birthdayNumber,
        specialMessage:
          layered.specialMessage ||
          "Wishing you a day filled with laughter, cake and everyone who loves you.",
        mainPhoto: layered.mainPhoto ?? layered.couplePhoto ?? null,
      }
    : { ...layered, formType };

  // Demo detail packs author their own designations and dress-code swatches.
  // Layer them over the builder-shaped data only in demo mode; live payloads
  // always use the customer's WeddingData.
  const extras = detailPack ? demoDetailsToRuntimeExtras(detailPack) : {};

  const payload = buildRuntimePayload({
    mode: "demo",
    assetsBaseUrl: appUrl,
    invitationUrl: demoUrl,
    expiresAt: null,
    planner: plannerBrand,
    // Same as the live invitation: the template package injects a <base href>
    // of its own, so app-relative pack URLs must become absolute to load.
    wedding: rewriteRuntimeMedia(
      {
        ...weddingDataToRuntimeInput({ id: "demo", slug: `${template.slug}-demo` }, demoData),
        ...extras,
      },
      (url) => absolutizeMediaUrl(url, appUrl)
    ),
    rsvp: {
      enabled: !birthday,
      preview: true,
      deadline: detailPack?.rsvpDeadline ?? null,
      attendingCount: 0,
      responseCount: 0,
      endpoint: "/api/rsvp",
      contactName: detailPack?.rsvpContactName ?? null,
      contactPhone: detailPack?.rsvpContactPhone ?? null,
      whatsapp: detailPack?.rsvpWhatsapp ?? null,
    },
  });

  const runtime = await loadDemoRuntime(template.id, payload).catch(() => null);

  return (
    // h-dvh + overflow-hidden: the template owns the entire viewport and the
    // page itself never scrolls, so the iframe is the only scroll surface.
    <div className="relative h-dvh w-full overflow-hidden bg-ivory-950">
      {runtime ? (
        <TemplateFrame
          html={runtime.html}
          payload={payload}
          title={`${template.name} — demo`}
          fallbackHref={`/templates/${template.slug}`}
          className="h-dvh w-full bg-ivory-950"
        />
      ) : (
        <div className="mx-auto flex h-dvh w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center text-ivory-100">
          <Icon name="videocam" size="2xl" className="text-gold-300" />
          <h1 className="font-heading-xl !text-ivory-50">This demo is being prepared</h1>
          <p className="font-body-sm text-ivory-300">
            The template package for <strong>{template.name}</strong> has not been published by the atelier yet.
            Explore the other templates in the meantime — live demos appear here as soon as a package is uploaded.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href="/templates">
              <Button variant="secondary" icon="grid_view">
                Browse templates
              </Button>
            </Link>
            <Link href={`/create/new?template=${template.slug}`}>
              <Button variant="outline" icon="auto_awesome">
                Customise it anyway
              </Button>
            </Link>
          </div>
        </div>
      )}

      {!embedded && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start justify-between gap-3 p-4">
          <Badge
            tone="default"
            icon="info"
            className="pointer-events-none bg-white text-black shadow-lg ring-1 ring-black/20 backdrop-blur-sm"
          >
            Demo
          </Badge>
          <Link href={`/templates/${template.slug}`} className="pointer-events-auto">
            <Button
              size="sm"
              variant="primary"
              icon="close"
              className="shadow-lg ring-1 ring-white/40"
            >
              Exit demo
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
