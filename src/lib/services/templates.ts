import { cache } from "react";

import type { Supabase } from "@/lib/services/helpers";

export interface PublicTemplate extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  thumbnail_url: string | null;
  preview_gif_url: string | null;
  price_paise: number;
  currency: string;
  /** Explicit per-currency prices (see the `product_prices` table). */
  prices: Array<{ currency: string; amount_minor: number; active: boolean }>;
  categories: { id: string; name: string; slug: string }[];
  /** Demo media pack assigned by admins; the demo page overlays its photos. */
  media_pack_id: string | null;
  /** Demo details pack (names, venue, events, dress code, RSVP contact). */
  demo_detail_pack_id: string | null;
  /** Background song from the shared music library, used in the demo. */
  music_track_id: string | null;
}

const TEMPLATE_SELECT = `
  id, name, slug, description, status, thumbnail_path, preview_gif_path, media_pack_id,
  demo_detail_pack_id, music_track_id, created_at, updated_at,
  product:products(id, name, price_paise, currency, prices:product_prices(currency, amount_minor, active)),
  categories:template_categories(category:categories(id, name, slug))
`;

export async function listActiveTemplates(supabase: Supabase) {
  const { data, error } = await supabase
    .from("templates")
    .select(TEMPLATE_SELECT)
    .eq("status", "active");

  if (error) throw error;
  return (data ?? []).map(normalizeTemplate);
}

export async function getTemplateBySlug(supabase: Supabase, slug: string) {
  const { data, error } = await supabase
    .from("templates")
    .select(TEMPLATE_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeTemplate(data) : null;
}

export async function getPublishedTemplateVersion(supabase: Supabase, templateId: string) {
  const { data, error } = await supabase
    .from("template_versions")
    .select("*")
    .eq("template_id", templateId)
    .eq("is_current", true)
    .eq("status", "published")
    .single();

  if (error) throw error;
  return data;
}

// The selection is built at runtime, so PostgREST returns untyped rows; this is
// the one boundary where the shape is re-established by hand.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTemplate(row: any): PublicTemplate {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    thumbnail_url: row.thumbnail_path
      ? storagePublicUrl("templates", row.thumbnail_path)
      : null,
    preview_gif_url: row.preview_gif_path
      ? storagePublicUrl("templates", row.preview_gif_path)
      : null,
    price_paise: row.product?.price_paise ?? 0,
    currency: row.product?.currency ?? "INR",
    prices: (Array.isArray(row.product?.prices) ? row.product.prices : [])
      .map((p: { currency?: string; amount_minor?: number; active?: boolean }) => ({
        currency: p?.currency,
        amount_minor: p?.amount_minor ?? 0,
        active: p?.active !== false,
      }))
      .filter(
        (p: { currency?: string; amount_minor: number; active: boolean }): p is {
          currency: string;
          amount_minor: number;
          active: boolean;
        } => typeof p.currency === "string"
      ),
    categories: (row.categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped row (see normalizeTemplate)
      .map((tc: any) => tc.category)
      .filter(Boolean),
    media_pack_id: row.media_pack_id ?? null,
    demo_detail_pack_id: row.demo_detail_pack_id ?? null,
    music_track_id: row.music_track_id ?? null,
  };
}

import { publicObjectUrl } from "@/lib/services/storage/urls";

/**
 * Public URL of a template asset. Delegates to the active storage backend
 * (Backblaze B2 when configured, Supabase Storage otherwise).
 */
export function storagePublicUrl(bucket: string, path: string): string {
  return publicObjectUrl(bucket, path);
}

/**
 * Resolves a template package location for the runtime. Returns the storage
 * folder prefix and the manifest for a given published version.
 */
export async function resolveTemplatePackage(
  supabase: Supabase,
  templateVersionId: string
) {
  const { data, error } = await supabase
    .from("template_versions")
    .select("id, version, storage_prefix, manifest, template_id")
    .eq("id", templateVersionId)
    .single();

  if (error) throw error;
  return data;
}

export const cachedActiveTemplates = cache(async (supabase: Supabase) =>
  listActiveTemplates(supabase)
);