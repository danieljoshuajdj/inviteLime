import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { createGuestSession } from "@/lib/services/guest";
import { getCurrentProfile, jsonError, readBody } from "@/lib/services/helpers";
import { getPlannerEntitlement } from "@/lib/services/planner-plans";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";
import { defaultWeddingData } from "@/lib/builder/defaults";

const startSchema = z.object({
  slug: z.string().optional().nullable(),
});

export const dynamic = "force-dynamic";

/**
 * Starts a guest creation session and an initial draft. Body carries the
 * template slug (optional — falls back to the default template).
 */
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Invalid start payload");

    const limit = await consumeRateLimit({
      bucket: "guest_session",
      key: clientKey(req),
      limit: 30,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many invitation sessions started from this device. Please try again later.");
    }

    const supabase = createAdminClient();

    // Resolve template: by slug if given & known, else the default (first active).
    let templateId: string;

    if (parsed.data.slug) {
      const { data: t, error } = await supabase
        .from("templates")
        .select("id")
        .eq("slug", parsed.data.slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) return jsonError(500, error.message);
      templateId = t?.id ?? "";
      if (!templateId) return jsonError(404, "Template not found");
    } else {
      const { data: t } = await supabase
        .from("templates")
        .select("id")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      templateId = t?.id ?? "";
      if (!templateId) return jsonError(404, "No template available");
    }

    const { data: version, error: versionError } = await supabase
      .from("template_versions")
      .select("id")
      .eq("template_id", templateId)
      .eq("is_current", true)
      .eq("status", "published")
      .maybeSingle();
    if (versionError || !version?.id) return jsonError(500, "Template version not published");

    const versionId = version.id;

    // Planner sessions are attached at draft creation, not at checkout. That
    // keeps the brand and plan identity stable while the couple builds, and
    // lets the checkout screen explain an expired plan before publishing.
    let plannerId: string | null = null;
    let plannerSubscriptionId: string | null = null;
    try {
      const authClient = await createServerClient();
      const sessionUser = await getCurrentProfile(authClient);
      if (sessionUser?.profile?.role === "planner") {
        const entitlement = await getPlannerEntitlement(sessionUser.user.id, { client: supabase });
        if (entitlement.active && entitlement.subscription) {
          plannerId = sessionUser.user.id;
          plannerSubscriptionId = entitlement.subscription.id;
        }
      }
    } catch {
      // Guest creation must keep working when auth cookies are absent/invalid.
    }

    const session = await createGuestSession();

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);

    const { data: draft, error: draftError } = await supabase
      .from("guest_drafts")
      .insert({
        session_id: session.id,
        template_id: templateId,
        template_version_id: versionId,
        wedding_data: defaultWeddingData() as never,
        expires_at: expiresAt.toISOString(),
        planner_id: plannerId,
        planner_subscription_id: plannerSubscriptionId,
      })
      .select("id")
      .single();
    if (draftError) return jsonError(500, draftError.message);

    return Response.json(
      { token: session.access_token, draftId: draft.id },
      {
        headers: {
          "Set-Cookie": `vc_guest_token=${session.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}`,
        },
      }
    );
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not start creation");
  }
}