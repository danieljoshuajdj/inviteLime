import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { Supabase } from "@/lib/services/helpers";
import { migrateDraftMediaToWedding } from "@/lib/services/media-migration";
import {
  addMonths,
  expirationFromWeddingDate,
  uniqueSlugWithSuffix,
} from "@/lib/utils";
import { isReservedSlug } from "@/lib/validators";
import { brandSnapshot, getPlannerBrand, snapshotToJson } from "@/lib/services/planner-branding";

export type WeddingStatus = "draft" | "active" | "expired" | "cancelled";

export interface NewWeddingInput {
  templateId: string;
  templateVersionId: string;
  brideName: string;
  groomName: string;
  weddingDate: string;
  guestSessionId?: string | null;
  userId?: string | null;
  productId: string;
  email?: string | null;
  weddingData?: Record<string, unknown> | null;
  plannerId?: string | null;
  plannerSubscriptionId?: string | null;
  billingSource?: "one_time" | "planner_plan";
}

export interface PublishedInvitation {
  id: string;
  slug: string;
  template_id: string | null;
  template_version_id: string | null;
  expiration_date: string | null;
  bride_name: string | null;
  groom_name: string | null;
  wedding_date: string | null;
  email: string | null;
}

/**
 * Generates a unique reservation-style slug. base = "{groom}-weds-{bride}".
 * If taken, appends a suffix and finally a numeric counter.
 */
export async function generateUniqueSlug(supabase: Supabase, base: string): Promise<string> {
  // Reserved platform routes can never become an invitation URL.
  const safeBase = isReservedSlug(base) ? `${base}-invitation` : base;
  const candidate = uniqueSlugWithSuffix(safeBase);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("weddings")
      .select("slug")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  for (let i = 2; i < 1000; i++) {
    const candidate = `${safeBase}-${i}`;
    const { data } = await supabase
      .from("weddings")
      .select("slug")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique slug");
}

/** Creates the wedding record in draft status (before payment). */
export async function createDraftWedding(input: NewWeddingInput): Promise<{ id: string; slug: string }> {
  const supabase = createAdminClient();
  const base = `${input.groomName.replace(/\s+/g, "-").toLowerCase()}-weds-${input.brideName.replace(/\s+/g, "-").toLowerCase()}`;
  const slug = await generateUniqueSlug(supabase, base);
  const rsvpEnabled =
    typeof input.weddingData?.rsvpEnabled === "boolean" ? input.weddingData.rsvpEnabled : false;

  const { data, error } = await supabase
    .from("weddings")
    .insert({
      slug,
      template_id: input.templateId,
      template_version_id: input.templateVersionId,
      product_id: input.productId,
      bride_name: input.brideName,
      groom_name: input.groomName,
      wedding_date: input.weddingDate,
      status: "draft",
      guest_session_id: input.guestSessionId ?? null,
      user_id: input.userId ?? null,
      email: input.email ?? null,
      rsvp_toggle: rsvpEnabled,
      wedding_data: (input.weddingData as never) ?? {},
      planner_id: input.plannerId ?? null,
      planner_subscription_id: input.plannerSubscriptionId ?? null,
      billing_source: input.billingSource ?? "one_time",
    })
    .select("id, slug")
    .single();

  if (error) throw error;
  return { id: data.id, slug: data.slug ?? slug };
}

/** Publishes a paid+drafted wedding and returns its public URL. */
export async function publishWedding(weddingId: string): Promise<PublishedInvitation> {
  const supabase = createAdminClient();

  const { data: wedding, error } = await supabase
    .from("weddings")
    .select(
      "id, slug, template_id, template_version_id, wedding_date, status, email, bride_name, groom_name, expiration_date, guest_session_id, wedding_data, planner_id, planner_subscription_id, billing_source, planner_brand_snapshot"
    )
    .eq("id", weddingId)
    .single();
  if (error) throw error;

  if (wedding.status === "active") {
    // A repeated publish (for example after re-running the dev bypass) should
    // still repair any draft that is still holding pre-migration media URLs.
    await mirrorWeddingDataToDrafts(supabase, wedding.guest_session_id, wedding.wedding_data);
    return toPublishedInvitation(wedding);
  }

  // Builder uploads live in a guest-session folder that /api/media authorizes
  // against the guest cookie alone, so the published invitation would show 403
  // for every photo. Relocate them into the wedding folder first. Failure is
  // not fatal: the couple has paid, and a published invitation with owner-only
  // photos still beats no invitation at all.
  try {
    const migrated = await migrateDraftMediaToWedding(weddingId, wedding.wedding_data);
    await mirrorWeddingDataToDrafts(supabase, wedding.guest_session_id, migrated.data);
    if (migrated.moved > 0 || migrated.failed > 0) {
      console.info("[publish] media migration", {
        weddingId,
        moved: migrated.moved,
        failed: migrated.failed,
        recorded: migrated.recorded,
      });
    }
  } catch (err) {
    console.warn("[publish] media migration failed; publishing anyway", err);
  }

  const expiration = wedding.wedding_date
    ? expirationFromWeddingDate(new Date(wedding.wedding_date)).toISOString()
    : addMonths(new Date(), 2).toISOString();

  // Branding is captured once, here, rather than read live on the public page.
  // A planner can rename the studio tomorrow without altering an invitation a
  // couple already sent to their guests.
  let brandSnapshotJson: ReturnType<typeof snapshotToJson> | null = null;
  if (wedding.billing_source === "planner_plan" && wedding.planner_id) {
    const brand = await getPlannerBrand(wedding.planner_id, supabase);
    if (brand && brand.brandName.trim() && brand.contactPhone.trim()) {
      brandSnapshotJson = snapshotToJson(brandSnapshot(brand));
    } else {
      console.warn("[publish] plan-covered wedding has no complete planner brand", {
        weddingId,
        plannerId: wedding.planner_id,
      });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("weddings")
    .update({
      status: "active",
      published_at: new Date().toISOString(),
      expiration_date: expiration,
      ...(brandSnapshotJson ? { planner_brand_snapshot: brandSnapshotJson } : {}),
    })
    .eq("id", weddingId)
    .select("id, slug, template_id, template_version_id, expiration_date, bride_name, groom_name, wedding_date, email")
    .single();

  if (updateError) throw updateError;
  return toPublishedInvitation(updated);
}

/**
 * Keeps the guest draft in step with media relocation at publish time.
 *
 * The builder's next autosave would otherwise carry the pre-publish URLs back
 * into the draft. This is best-effort: a draft that cannot be updated must not
 * stop a paid invitation from going live.
 */
async function mirrorWeddingDataToDrafts(
  supabase: ReturnType<typeof createAdminClient>,
  sessionId: string | null,
  weddingData: unknown
): Promise<void> {
  if (!sessionId || !weddingData) return;
  const { error } = await supabase
    .from("guest_drafts")
    .update({ wedding_data: weddingData as never })
    .eq("session_id", sessionId);
  if (error) {
    console.warn("[publish] could not update guest drafts with migrated media", {
      sessionId,
      error: error.message,
    });
  }
}

function toPublishedInvitation(w: {
  id: string;
  slug: string | null;
  template_id: string | null;
  template_version_id: string | null;
  expiration_date: string | null;
  bride_name: string | null;
  groom_name: string | null;
  wedding_date: string | null;
  email: string | null;
}): PublishedInvitation {
  if (!w.slug) throw new Error("Published invitation has no slug");
  return {
    id: w.id,
    slug: w.slug,
    template_id: w.template_id,
    template_version_id: w.template_version_id,
    expiration_date: w.expiration_date,
    bride_name: w.bride_name,
    groom_name: w.groom_name,
    wedding_date: w.wedding_date,
    email: w.email,
  };
}

export interface PublicWeddingRecord {
  id: string;
  slug: string;
  bride_name: string;
  groom_name: string;
  wedding_date: string;
  venue: string | null;
  address: string | null;
  maps_url: string | null;
  template_id: string;
  template_version_id: string;
  wedding_data: Record<string, unknown> | null;
  expiration_date: string | null;
  rsvp_toggle: boolean;
  rsvp_deadline: string | null;
  planner_id: string | null;
  planner_brand_snapshot: Json | null;
  billing_source: "one_time" | "planner_plan";
}

/** Fetches a published invitation for the public runtime. Includes expiry check. */
/**
 * Whether a published invitation has lapsed.
 *
 * Must stay in step with `public.is_wedding_public()` in the migrations, which
 * requires `expiration_date >= current_date`. Both therefore treat the
 * expiration date as inclusive: an invitation set to 2026-02-14 stays reachable
 * for the whole of that day, matching the "Active until" copy in the builder.
 * Comparing whole days (rather than `new Date(date) < Date.now()`) avoids the
 * off-by-one where a subscription died at 00:00 on its own final day.
 */
export function isWeddingExpired(expirationDate: string | null, now: Date = new Date()): boolean {
  if (!expirationDate) return false;
  // `expiration_date` is a date column; slice guards against a timestamp.
  const expiryDay = expirationDate.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return expiryDay < today;
}

export async function getPublicWedding(supabase: Supabase, slug: string): Promise<PublicWeddingRecord | null> {
  const { data, error } = await supabase
    .from("weddings")
    .select(
      "id, slug, bride_name, groom_name, wedding_date, venue, address, maps_url, template_id, template_version_id, wedding_data, expiration_date, rsvp_toggle, rsvp_deadline, status, planner_id, planner_brand_snapshot, billing_source"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active") return null;
  if (isWeddingExpired(data.expiration_date)) return null;

  return data as unknown as PublicWeddingRecord;
}

export async function markExpiredWeddings(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("mark_expired_invitations");
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** Returns the canonical public URL for a wedding slug. */
export function invitationUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/w/${slug}`;
}

export function nextEligibleYear(): number {
  return new Date().getFullYear() + 1;
}