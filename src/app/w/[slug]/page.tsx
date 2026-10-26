import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";
import { getPublicWedding, invitationUrl } from "@/lib/services/weddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWeddingData } from "@/lib/builder/defaults";
import { InvitationRuntime } from "@/components/runtime/InvitationRuntime";
import { TemplateFrame } from "@/components/runtime/TemplateFrame";
import { loadInvitationRuntime } from "@/lib/services/template-runtime";
import { buildRuntimePayload } from "@/lib/runtime/payload";
import { weddingDataToRuntimeInput } from "@/lib/services/demo-wedding";
import { absolutizeMediaUrl, rewriteRuntimeMedia } from "@/lib/services/media-urls";
import { resolveInvitationPlannerBrand } from "@/lib/services/planner-branding";
import { buildInvitationMetadata } from "@/lib/services/invitation-metadata";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerClient();
  try {
    const wedding = await getPublicWedding(supabase, slug);
    if (!wedding) return { title: "Invitation" };
    const plannerBrand = await resolveInvitationPlannerBrand(wedding).catch(() => null);
    return buildInvitationMetadata({
      slug: wedding.slug,
      brideName: wedding.bride_name,
      groomName: wedding.groom_name,
      brandName: plannerBrand?.brandName ?? null,
    });
  } catch {
    return { title: "Invitation" };
  }
}

export default async function PublicInvitationPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  // `?embed=1` marks a preview framed by the app itself (the post-purchase
  // screen), so loading it is not a guest visit.
  const embedded = (await searchParams).embed === "1";
  const supabase = await createServerClient();
  const wedding = await getPublicWedding(supabase, slug).catch(() => null);
  if (!wedding) notFound();

  // Public runtime runs against wedding_data (canonical content source) and
  // the count of confirmed RSVPs (statistics are publicly shown per design).
  const data = normalizeWeddingData(wedding.wedding_data);

  let rsvpCount = 0;
  let attendingCount = 0;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("rsvp_responses")
      .select("attendance", { count: "exact", head: true })
      .eq("wedding_id", wedding.id);
    if (!error) rsvpCount = count ?? 0;

    const { count: attending, error: err2 } = await admin
      .from("rsvp_responses")
      .select("attendance", { count: "exact", head: true })
      .eq("wedding_id", wedding.id)
      .eq("attendance", "attending");
    if (!err2) attendingCount = attending ?? 0;

    // best effort view tracking (fire & forget, never blocks the render)
    if (!embedded) {
      void admin
        .rpc("record_invitation_view", {
          p_wedding_id: wedding.id,
          p_referrer: null,
        })
        .then(
          () => {},
          () => {}
        );
    }
  } catch {
    // degrade gracefully if the DB is unavailable.
  }

  // Branding comes from the snapshot captured at publish time. For the rare
  // plan-covered invitation published before the snapshot field existed, the
  // resolver falls back to the planner's current brand rather than showing no
  // credit at all.
  const plannerBrand = await resolveInvitationPlannerBrand(wedding).catch(() => null);

  // The purchased template loads its own immutable HTML/CSS/JS package in a
  // sandboxed frame with public invitation data bound to it. Without an
  // uploaded package we fall back to the built-in runtime.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payload = buildRuntimePayload({
    mode: "live",
    assetsBaseUrl: appUrl,
    invitationUrl: invitationUrl(wedding.slug),
    expiresAt: wedding.expiration_date,
    planner: plannerBrand
      ? {
          brandName: plannerBrand.brandName,
          contactPhone: plannerBrand.contactPhone,
          address: plannerBrand.address,
          mapsUrl: plannerBrand.mapsUrl,
        }
      : null,
    // The template package sets a `<base href>` of its own, so a stored
    // app-relative media path would resolve against object storage instead of
    // the app. Absolute URLs keep guest media loadable; they need no signature
    // because an active wedding's media is already public through `/api/media`.
    wedding: rewriteRuntimeMedia(
      weddingDataToRuntimeInput(
        {
          id: wedding.id,
          slug: wedding.slug,
          date: wedding.wedding_date,
          venue: wedding.venue,
          address: wedding.address,
          mapsUrl: wedding.maps_url,
        },
        data
      ),
      (url) => absolutizeMediaUrl(url, appUrl)
    ),
    rsvp: {
      enabled: wedding.rsvp_toggle,
      deadline: wedding.rsvp_deadline,
      attendingCount,
      responseCount: rsvpCount,
      endpoint: "/api/rsvp",
      whatsappNumber: data.rsvpWhatsapp,
    },
  });

  const runtime = await loadInvitationRuntime(wedding.template_version_id, payload).catch(() => null);

  if (runtime) {
    return (
      <TemplateFrame
        html={runtime.html}
        payload={payload}
        title={`${wedding.groom_name} & ${wedding.bride_name} — Wedding Invitation`}
        fallbackHref={invitationUrl(wedding.slug)}
      />
    );
  }

  return (
    <InvitationRuntime
      wedding={wedding}
      weddingData={data as never}
      rsvpCount={rsvpCount}
      attendingCount={attendingCount}
      planner={
        plannerBrand
          ? {
              brandName: plannerBrand.brandName,
              contactPhone: plannerBrand.contactPhone,
              address: plannerBrand.address,
              mapsUrl: plannerBrand.mapsUrl,
            }
          : null
      }
    />
  );
}
