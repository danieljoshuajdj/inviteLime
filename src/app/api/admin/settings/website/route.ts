import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import {
  getWebsiteRedirectDestination,
  setWebsiteRedirectDestination,
  WEBSITE_REDIRECT_SETTING_KEY,
} from "@/lib/services/website-redirect";
import {
  MAX_WEBSITE_URL_LENGTH,
  normalizeWebsiteDestination,
} from "@/lib/website-redirect";

export const dynamic = "force-dynamic";

const websiteRedirectSchema = z.object({
  url: z.string().max(MAX_WEBSITE_URL_LENGTH),
});

/** Admin-only read of the saved destination. */
export async function GET() {
  try {
    const supabase = await createServerClient();
    await requireAdmin(supabase);
    return Response.json({
      websiteUrl: await getWebsiteRedirectDestination(),
    });
  } catch (error) {
    return adminApiError(error);
  }
}

/**
 * Saves or clears the single global website destination. Only admins may call
 * this; the public redirect route never accepts a destination from a visitor.
 */
export async function PUT(req: Request) {
  try {
    const supabase = await createServerClient();
    const admin = await requireAdmin(supabase);

    const body = await readBody(req);
    const parsed = websiteRedirectSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid website redirect", parsed.error.flatten());
    }

    const raw = parsed.data.url;
    const normalized = normalizeWebsiteDestination(raw);
    if (raw.trim() && !normalized) {
      return jsonError(
        400,
        "Enter a valid website address, for example https://example.com."
      );
    }

    const previous = await getWebsiteRedirectDestination();
    await setWebsiteRedirectDestination(normalized);
    await logAdminAction(
      admin.user.id,
      "settings.website_redirect.update",
      "site_settings",
      WEBSITE_REDIRECT_SETTING_KEY,
      { previous, next: normalized }
    );

    return Response.json({ websiteUrl: normalized });
  } catch (error) {
    return adminApiError(error);
  }
}
