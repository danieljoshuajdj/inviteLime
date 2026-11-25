import { z } from "zod";

import {
  MAX_HERO_EYEBROW_LENGTH,
  MAX_HERO_SUBTITLE_LENGTH,
  MAX_HERO_TITLE_LENGTH,
} from "@/lib/hero-content";
import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import {
  attachHeroImageUrls,
  getHeroContentWithUrls,
  HERO_SETTING_KEY,
  saveHeroCopy,
} from "@/lib/services/hero-content";

export const dynamic = "force-dynamic";

const heroCopySchema = z.object({
  title: z.string().max(MAX_HERO_TITLE_LENGTH),
  subtitle: z.string().max(MAX_HERO_SUBTITLE_LENGTH),
  eyebrow: z.string().max(MAX_HERO_EYEBROW_LENGTH),
});

/** Admin-only read of the home-page hero copy and carousel. */
export async function GET() {
  try {
    const supabase = await createServerClient();
    await requireAdmin(supabase);
    return Response.json({ hero: await getHeroContentWithUrls() });
  } catch (error) {
    return adminApiError(error);
  }
}

/**
 * Saves the editable home-page copy. Empty fields fall back to the shipped
 * defaults, so the page can never render a blank headline. Images are managed
 * by the sibling `/images` route.
 */
export async function PUT(req: Request) {
  try {
    const supabase = await createServerClient();
    const admin = await requireAdmin(supabase);

    const body = await readBody(req);
    const parsed = heroCopySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid hero content", parsed.error.flatten());
    }

    const saved = await saveHeroCopy(parsed.data);
    await logAdminAction(admin.user.id, "settings.hero.update", "site_settings", HERO_SETTING_KEY, {
      title: saved.title,
      eyebrow: saved.eyebrow,
    });

    return Response.json({ hero: attachHeroImageUrls(saved) });
  } catch (error) {
    return adminApiError(error);
  }
}
