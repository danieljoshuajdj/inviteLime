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

export async function getPublicSettings() {
  const settings = await cachedSettings();
  const site = (settings["site"] as Record<string, unknown>) ?? {};
  const hero = (settings["hero"] as Record<string, unknown>) ?? {};
  const marketing = (settings["marketing"] as Record<string, unknown>) ?? {};
  const pricing = (settings["pricing"] as Record<string, unknown>) ?? {};
  const faq = (settings["faq"] as Array<{ q: string; a: string }>) ?? [];

  return { site, hero, marketing, pricing, faq };
}

/** Reads settings for server components; falls back to env-driven defaults when DB is unreachable. */
export async function getPublicSiteData() {
  const [settings, siteName] = await Promise.all([
    getPublicSettings(),
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ]);
  return settings;
}

export async function updateSetting(key: string, value: unknown) {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value: value as never }, { onConflict: "key" });
  if (error) throw error;
}