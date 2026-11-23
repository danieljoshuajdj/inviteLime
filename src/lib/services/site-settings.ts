import "server-only";

import { cache } from "react";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface SettingsByKey {
  [key: string]: unknown;
}

function mergeRows(rows: { key: string; value: unknown }[]): SettingsByKey {
  const out: SettingsByKey = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

const cachedSettings = cache(async (): Promise<SettingsByKey> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("site_settings").select("key, value");
  if (error) return {};
  return mergeRows(data ?? []);
});

export const getSiteSettings = cachedSettings;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const settings = await cachedSettings();
  return (settings[key] as T | undefined) ?? fallback;
}

/**
 * Uncached settings read.
 *
 * Normal server components use the request-scoped cache above so a page reads
 * the settings table once. A redirect route is different: an admin may change
 * the destination between two clicks, and the very next request must observe
 * the write. This helper queries the same `site_settings` table directly
 * instead of introducing a second configuration store.
 */
export async function getSettingFresh<T>(key: string, fallback: T): Promise<T> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return (data.value as T | undefined) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getPublicSettings() {
  const settings = await cachedSettings();
  const site = (settings["site"] as Record<string, unknown>) ?? {};
  const hero = (settings["hero"] as Record<string, unknown>) ?? {};
  const marketing = (settings["marketing"] as Record<string, unknown>) ?? {};
  const pricing = (settings["pricing"] as Record<string, unknown>) ?? {};
  const faq = (settings["faq"] as Array<{ q: string; a: string }>) ?? [];

  return { site, hero, marketing, pricing, faq };
}

/** Reads settings for server components; falls back to defaults when the DB is unreachable. */
export async function getPublicSiteData() {
  return getPublicSettings();
}

export async function updateSetting(key: string, value: unknown) {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value: value as never }, { onConflict: "key" });
  if (error) throw error;
}