import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SuccessContent } from "@/components/builder/SuccessContent";
import { resolveInvitationPlannerBrand } from "@/lib/services/planner-branding";

export const metadata: Metadata = {
  title: "Invitation Published",
  description: "Your wedding invitation is live and ready to share.",
};

interface PageProps {
  searchParams: Promise<{ wedding?: string; order?: string }>;
}

interface SuccessWeddingData {
  id: string;
  slug: string;
  template_id: string | null;
  template_version_id: string | null;
  templateName: string | null;
  brideName: string | null;
  groomName: string | null;
  brideBio: string | null;
  groomBio: string | null;
  coupleBio: string | null;
  story: string | null;
  weddingDate: string | null;
  weddingTime: string | null;
  venue: string | null;
  address: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  events: Array<{ name: string; date?: string | null; time?: string | null; venue?: string | null; address?: string | null; mapsUrl?: string | null; description?: string | null }>;
  gallery: Array<{ role: string; url: string; name?: string }>;
  bridePhoto?: string | null;
  groomPhoto?: string | null;
  couplePhoto?: string | null;
  music?: { role: string; url: string; name?: string } | null;
  email: string | null;
  expirationDate: string | null;
  status: string;
}

export default async function SuccessPage({ searchParams }: PageProps) {
  const { wedding: weddingId, order: orderId } = await searchParams;

  if (!weddingId) notFound();

  const supabase = createAdminClient();
  const { data: wedding, error } = await supabase
    .from("weddings")
    .select(
      "id, slug, template_id, template_version_id, bride_name, groom_name, couple_bio, story, wedding_date, wedding_time, venue, address, maps_url, latitude, longitude, email, expiration_date, status, billing_source, planner_id, planner_brand_snapshot, wedding_data, rsvp_toggle, rsvp_deadline"
    )
    .eq("id", weddingId)
    .single();

  if (error || !wedding || wedding.status !== "active" || !wedding.slug) notFound();

  // Transform to camelCase for the component
  const weddingDataJson = (wedding.wedding_data ?? {}) as Record<string, unknown>;

  // Template relationships are not declared in the generated types, so the
  // label is resolved with a separate lookup instead of a nested select.
  let templateName: string | null = null;
  if (wedding.template_id) {
    const { data: template } = await supabase
      .from("templates")
      .select("name")
      .eq("id", wedding.template_id)
      .maybeSingle();
    templateName = template?.name ?? null;
  }

  const plannerBrand = await resolveInvitationPlannerBrand(wedding).catch(() => null);

  const weddingData = {
    id: wedding.id,
    slug: wedding.slug,
    template_id: wedding.template_id,
    template_version_id: wedding.template_version_id,
    templateName,
    brideName: wedding.bride_name,
    groomName: wedding.groom_name,
    brideBio: null,
    groomBio: null,
    coupleBio: wedding.couple_bio,
    story: wedding.story,
    weddingDate: wedding.wedding_date,
    weddingTime: wedding.wedding_time,
    venue: wedding.venue,
    address: wedding.address,
    mapsUrl: wedding.maps_url,
    latitude: wedding.latitude,
    longitude: wedding.longitude,
    email: wedding.email,
    expirationDate: wedding.expiration_date,
    status: wedding.status,
    events: (Array.isArray(weddingDataJson.events) ? weddingDataJson.events : []) as SuccessWeddingData["events"],
    gallery: (Array.isArray(weddingDataJson.gallery) ? weddingDataJson.gallery : []) as SuccessWeddingData["gallery"],
    bridePhoto: (weddingDataJson.bridePhoto as string) ?? null,
    groomPhoto: (weddingDataJson.groomPhoto as string) ?? null,
    couplePhoto: (weddingDataJson.couplePhoto as string) ?? null,
    music: (weddingDataJson.music as SuccessWeddingData["music"]) ?? null,
  };

  return (
    <SuccessContent
      wedding={weddingData}
      orderId={orderId}
      coveredByPlan={wedding.billing_source === "planner_plan"}
      plannerBrandName={plannerBrand?.brandName ?? null}
    />
  );
}