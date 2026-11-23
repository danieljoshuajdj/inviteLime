import "server-only";

import { getSetting, getSettingFresh, updateSetting } from "@/lib/services/site-settings";
import {
  normalizeWebsiteDestination,
  websiteRedirectHref,
} from "@/lib/website-redirect";

/**
 * `site_settings` key for the global website destination. It lives beside the
 * existing site/hero/marketing settings, so there is one configuration store.
 */
export const WEBSITE_REDIRECT_SETTING_KEY = "website_redirect_url";

/** Runtime data templates receive. The destination itself is never included. */
export interface WebsiteRedirectState {
  /** Absolute permanent platform link, e.g. `https://app.example/visit-website`. */
  websiteUrl: string;
  /** True when an admin has saved a destination; templates may hide the button. */
  websiteConfigured: boolean;
}

/**
 * The saved destination, or null when unset/invalid. Pass `{ fresh: true }` on
 * the redirect path so a change made seconds ago is visible immediately.
 */
export async function getWebsiteRedirectDestination(
  options: { fresh?: boolean } = {}
): Promise<string | null> {
  try {
    const stored = options.fresh
      ? await getSettingFresh<unknown>(WEBSITE_REDIRECT_SETTING_KEY, null)
      : await getSetting<unknown>(WEBSITE_REDIRECT_SETTING_KEY, null);
    return normalizeWebsiteDestination(stored);
  } catch {
    // A settings read must never take an invitation or a redirect down.
    return null;
  }
}

/**
 * Builds the stable link templates bind to. It is always available, even when
 * no destination is configured: the redirect route then shows a safe
 * "not available" page instead of sending a guest to an incorrect website.
 */
export async function getWebsiteRedirectState(origin: string): Promise<WebsiteRedirectState> {
  const destination = await getWebsiteRedirectDestination();
  return {
    websiteUrl: websiteRedirectHref(origin),
    websiteConfigured: Boolean(destination),
  };
}

/** Saves a normalised destination. An empty value clears the redirect. */
export async function setWebsiteRedirectDestination(value: string | null): Promise<void> {
  const normalized = normalizeWebsiteDestination(value);
  if (value && value.trim() && !normalized) {
    throw new Error("Enter a valid website address, for example https://example.com.");
  }
  // An empty string keeps the jsonb column non-null while meaning "unset".
  await updateSetting(WEBSITE_REDIRECT_SETTING_KEY, normalized ?? "");
}
