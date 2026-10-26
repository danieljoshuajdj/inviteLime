import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Supabase } from "@/lib/services/helpers";

export interface PlannerBrand {
  profileId: string;
  brandName: string;
  contactPhone: string;
  address: string | null;
  mapsUrl: string | null;
  updatedAt: string | null;
}

export interface PlannerBrandSnapshot {
  brandName: string;
  contactPhone: string;
  address: string | null;
  mapsUrl: string | null;
  capturedAt: string;
}

export function normalizePhoneForTel(phone: string): string {
  const trimmed = phone.trim();
  const leadingPlus = trimmed.startsWith("+") ? "+" : "";
  return leadingPlus + trimmed.replace(/[^\d]/g, "");
}

export function isSafeExternalUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalizeMapsUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!isSafeExternalUrl(trimmed)) return null;
  return trimmed;
}

/** Shape stored on the wedding at publish time. */
export function brandSnapshot(brand: PlannerBrand, now: Date = new Date()): PlannerBrandSnapshot {
  return {
    brandName: brand.brandName.trim(),
    contactPhone: brand.contactPhone.trim(),
    address: brand.address?.trim() || null,
    mapsUrl: normalizeMapsUrl(brand.mapsUrl),
    capturedAt: now.toISOString(),
  };
}

/** Tolerant reader for historical snapshots. */
export function readBrandSnapshot(value: unknown): PlannerBrandSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const brandName = typeof candidate.brandName === "string" ? candidate.brandName.trim() : "";
  const contactPhone = typeof candidate.contactPhone === "string" ? candidate.contactPhone.trim() : "";
  if (!brandName || !contactPhone) return null;
  const mapsUrl =
    typeof candidate.mapsUrl === "string" ? candidate.mapsUrl.trim() : "";
  return {
    brandName,
    contactPhone,
    address: typeof candidate.address === "string" && candidate.address.trim() ? candidate.address.trim() : null,
    mapsUrl: mapsUrl && isSafeExternalUrl(mapsUrl) ? mapsUrl : null,
    capturedAt: typeof candidate.capturedAt === "string" ? candidate.capturedAt : "",
  };
}

export function snapshotToJson(snapshot: PlannerBrandSnapshot): Json {
  return {
    brandName: snapshot.brandName,
    contactPhone: snapshot.contactPhone,
    address: snapshot.address,
    mapsUrl: snapshot.mapsUrl,
    capturedAt: snapshot.capturedAt,
  };
}

/**
 * Brand shown on a published invitation.
 *
 * The snapshot is authoritative: editing the studio profile later must not
 * rewrite a link guests already have. Only older plan-covered invitations that
 * predate snapshots fall back to the planner's current brand.
 */
export async function resolveInvitationPlannerBrand(
  wedding: {
    billing_source: string | null;
    planner_id: string | null;
    planner_brand_snapshot: unknown;
  },
  client?: Supabase
): Promise<PlannerBrandSnapshot | null> {
  if (wedding.billing_source !== "planner_plan") return null;

  const snapshot = readBrandSnapshot(wedding.planner_brand_snapshot);
  if (snapshot) return snapshot;
  if (!wedding.planner_id) return null;

  const current = await getPlannerBrand(wedding.planner_id, client).catch(() => null);
  if (!current || !isPlannerBrandComplete(current)) return null;

  return {
    brandName: current.brandName.trim(),
    contactPhone: current.contactPhone.trim(),
    address: current.address?.trim() || null,
    mapsUrl: normalizeMapsUrl(current.mapsUrl),
    capturedAt: current.updatedAt ?? "",
  };
}

export async function getPlannerBrand(
  profileId: string,
  client: Supabase = createAdminClient()
): Promise<PlannerBrand | null> {
  const { data, error } = await client
    .from("planner_branding")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    profileId: data.profile_id,
    brandName: data.brand_name,
    contactPhone: data.contact_phone,
    address: data.address,
    mapsUrl: data.maps_url,
    updatedAt: data.updated_at,
  };
}

export async function savePlannerBrand(input: {
  profileId: string;
  brandName: string;
  contactPhone: string;
  address?: string | null;
  mapsUrl?: string | null;
}): Promise<PlannerBrand> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("planner_branding")
    .upsert(
      {
        profile_id: input.profileId,
        brand_name: input.brandName.trim(),
        contact_phone: input.contactPhone.trim(),
        address: input.address?.trim() || null,
        maps_url: normalizeMapsUrl(input.mapsUrl),
      },
      { onConflict: "profile_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    profileId: data.profile_id,
    brandName: data.brand_name,
    contactPhone: data.contact_phone,
    address: data.address,
    mapsUrl: data.maps_url,
    updatedAt: data.updated_at,
  };
}

export function isPlannerBrandComplete(brand: PlannerBrand | null): brand is PlannerBrand {
  return Boolean(brand?.brandName.trim() && brand.contactPhone.trim());
}
