import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { createBuilderSession, BUILDER_TOKEN_COOKIE } from "@/lib/services/builder";
import { getCurrentProfile, jsonError, readBody } from "@/lib/services/helpers";
import { getPlannerEntitlement } from "@/lib/services/planner-plans";
import { consumeRateLimit } from "@/lib/services/ops";
import { defaultWeddingData } from "@/lib/builder/defaults";

const startSchema = z.object({
  slug: z.string().optional().nullable(),
});

export const dynamic = "force-dynamic";

/**
 * Starts an authenticated builder session and its initial draft.
 *
 * Template creation is account-only. The caller's Supabase session is verified
 * server-side; an anonymous request receives 401 and never reaches the draft
 * tables. The returned token is bound to that user id and is checked again by
 * every draft, preview, upload and checkout endpoint.
 */
export async function POST(req: Request) {
  try {
    const authClient = await createServerClient();
    const sessionUser = await getCurrentProfile(authClient);
    if (!sessionUser) {
      return jsonError(401, "Sign in with Google to create and customize your templates.");
    }

    const body = await readBody(req);
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Invalid start payload");

    const limit = await consumeRateLimit({
      bucket: "builder_session",
      key: sessionUser.user.id,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many invitation sessions started from this account. Please try again later.");
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
    if (sessionUser.profile?.role === "planner") {
      const entitlement = await getPlannerEntitlement(sessionUser.user.id, { client: supabase });
      if (entitlement.active && entitlement.subscription) {
        plannerId = sessionUser.user.id;
        plannerSubscriptionId = entitlement.subscription.id;
      }
    }

    const session = await createBuilderSession({
      userId: sessionUser.user.id,
      ipAddress: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

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

    const maxAge = Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    return Response.json(
      { token: session.access_token, draftId: draft.id },
      {
        headers: {
          "Set-Cookie": `${BUILDER_TOKEN_COOKIE}=${session.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
        },
      }
    );
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not start creation");
  }
}
