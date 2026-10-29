import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestDraft, guestTokenFromCookies } from "@/lib/services/guest";
import { createDraftWedding, invitationUrl } from "@/lib/services/weddings";
import { finalizePaidWedding } from "@/lib/services/finalize-purchase";
import { isPaymentBypassEnabled } from "@/lib/services/dev-bypass";
import { jsonError, readBody } from "@/lib/services/helpers";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";
import { normalizeWeddingData } from "@/lib/builder/defaults";
import { formTypeOrDefault } from "@/lib/builder/forms";
import { validateDetails } from "@/lib/builder/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(10).optional(),
});

/**
 * Publishes the caller's own guest draft as if it had been paid for.
 *
 * DEV-ONLY. Disabled unless DEV_BYPASS_PAYMENT=1 and never in production (see
 * isPaymentBypassEnabled). Intended solely to check the post-purchase flow —
 * the live share URL and the "your invitation is live" email — without a real
 * Razorpay transaction.
 *
 * Everything after the payment is real: it reuses finalizePaidWedding, the
 * exact function the Razorpay verify and webhook paths call, so the publish,
 * draft-media relocation, account linking and both emails are the production
 * code paths. Only the charge itself is skipped.
 *
 * The caller must present the guest session token, so this can only finalize a
 * draft that session already owns — it is not a way to publish someone else's
 * invitation.
 */
export async function POST(req: Request) {
  if (!isPaymentBypassEnabled()) {
    return jsonError(404, "Not found");
  }

  try {
    const body = await readBody(req).catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Invalid payload");

    const cookieToken = guestTokenFromCookies(req.headers.get("cookie"));
    const authToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const token = parsed.data.token ?? cookieToken ?? authToken;
    if (!token) return jsonError(401, "Guest session required");

    const limit = await consumeRateLimit({
      bucket: "dev_publish",
      key: clientKey(req),
      limit: 20,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many dev publish attempts. Please try again later.");
    }

    const supabase = createAdminClient();
    const draft = await getGuestDraft(supabase, token);
    if (!draft) return jsonError(404, "Draft not found for this session");

    const data = (draft.wedding_data ?? {}) as Record<string, unknown>;

    const { data: templateRow } = await supabase
      .from("templates")
      .select("product_id, form_type, product:products(price_paise, currency)")
      .eq("id", draft.template_id)
      .single();
    const product = templateRow as unknown as {
      product_id: string | null;
      form_type: string | null;
      product: { price_paise: number; currency: string } | null;
    } | null;
    if (!product?.product_id) return jsonError(400, "This template is not configured for publishing");

    const formType = formTypeOrDefault(product.form_type);
    const weddingData = normalizeWeddingData({ ...data, formType });
    const issue = validateDetails(weddingData, formType);
    if (issue) {
      return jsonError(400, `Draft is incomplete. ${issue.message}`);
    }

    // Reuse a draft wedding this session already created (e.g. the developer
    // clicked "Pay & publish" first), so repeated dev publishes update one
    // invitation instead of littering the DB with duplicates.
    const { data: existingRows } = await supabase
      .from("weddings")
      .select("id, slug, status, expiration_date")
      .eq("guest_session_id", draft.session_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existing = existingRows as { id: string; slug: string; status: string } | null;

    let weddingId: string;
    let pricePaise = 0;
    let currency = "INR";

    const prod = Array.isArray(product.product) ? product.product[0] : product.product;
    pricePaise = prod?.price_paise ?? 0;
    currency = prod?.currency ?? "INR";

    if (existing) {
      weddingId = existing.id;
    } else {
      const created = await createDraftWedding({
        templateId: draft.template_id,
        templateVersionId: draft.template_version_id,
        formType,
        brideName: weddingData.brideName || undefined,
        groomName: weddingData.groomName || undefined,
        celebrantName: weddingData.celebrantName || undefined,
        weddingDate:
          formType === "birthday_wishes" ? undefined : weddingData.weddingDate || undefined,
        guestSessionId: draft.session_id,
        email: draft.email,
        weddingData: data,
        productId: product.product_id,
      });
      weddingId = created.id;
    }

    const { published, coupleEmail } = await finalizePaidWedding({
      weddingId,
      pricePaise,
      currency,
      source: "dev",
    });

    return Response.json({
      published: true,
      bypassed: true,
      url: invitationUrl(published.slug),
      weddingId,
      emailSentTo: published.email,
      // The exact couple-facing email that was rendered and handed to the
      // provider, so the flow can be inspected without a live inbox.
      emailPreview: coupleEmail,
      note: "DEV BYPASS — published without payment (DEV_BYPASS_PAYMENT=1).",
    });
  } catch (err) {
    console.error("[dev-publish] failed", err);
    return jsonError(500, err instanceof Error ? err.message : "Dev publish failed");
  }
}
