import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestDraft } from "@/lib/services/guest";
import { getActiveGuestWedding } from "@/lib/services/guest-wedding";
import { getPlannerEntitlement } from "@/lib/services/planner-plans";
import {
  getPlannerBrand,
  isPlannerBrandComplete,
  normalizeMapsUrl,
} from "@/lib/services/planner-branding";
import { buildGuestPreviewPayload } from "@/lib/services/guest-preview";
import { reconcileMediaForLiveWedding } from "@/lib/services/wedding-media-reconcile";
import { resolveRuntimeTemplate, buildRuntimeDocument } from "@/lib/services/template-runtime";
import { readBody, jsonError } from "@/lib/services/helpers";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";
import { weddingDraftSchema } from "@/lib/validators";

const previewSchema = z.object({
  token: z.string().min(10),
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid(),
  // Preview renders the guest's in-progress draft, so it is validated as a
  // draft — not with the strict publish schema.
  weddingData: weddingDraftSchema,
});

export const dynamic = "force-dynamic";

/**
 * Renders the guest's invitation exactly as it will look after publishing,
 * using their in-progress wedding data. The bound template document is passed
 * through the same sandboxed TemplateFrame used by published invitations and
 * demo mode; nothing written here is persisted.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid preview payload", parsed.error.flatten());
    }

    const limit = await consumeRateLimit({
      bucket: "guest_preview",
      key: clientKey(req),
      limit: 120,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Preview is temporarily busy. Please retry in a moment.");
    }

    const supabase = createAdminClient();

    // The draft is the source of truth for who owns this session and which
    // template/version they are working on.
    const draft = await getGuestDraft(supabase, parsed.data.token);
    if (!draft) return jsonError(401, "Your session has expired. Start over to continue.");
    if (draft.template_id !== parsed.data.templateId || draft.template_version_id !== parsed.data.templateVersionId) {
      return jsonError(400, "Template mismatch");
    }

    const source = await resolveRuntimeTemplate(supabase, parsed.data.templateVersionId);
    if (!source) return jsonError(404, "This template package is not published yet.");

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

    // After publishing, media lives in the wedding folder. A stale builder tab
    // still carries draft-scoped URLs whose objects were moved; replace those
    // with the published equivalents so the preview does not flash broken
    // images. New uploads after publishing are already wedding-scoped and are
    // kept as they are.
    // A planner preview must look like the publish it is heading toward. Plan
    // coverage is resolved with the same rules as /api/orders; a lapsed plan or
    // incomplete brand keeps the preview unbranded.
    let planner: {
      brandName: string;
      contactPhone: string;
      address: string | null;
      mapsUrl: string | null;
    } | null = null;
    if (draft.planner_id) {
      const [entitlement, brand] = await Promise.all([
        getPlannerEntitlement(draft.planner_id, { client: supabase }).catch(() => null),
        getPlannerBrand(draft.planner_id, supabase).catch(() => null),
      ]);
      if (entitlement?.active && entitlement.canCreate && isPlannerBrandComplete(brand)) {
        planner = {
          brandName: brand.brandName,
          contactPhone: brand.contactPhone,
          address: brand.address,
          mapsUrl: normalizeMapsUrl(brand.mapsUrl),
        };
      }
    }

    const live = await getActiveGuestWedding(supabase, draft.session_id).catch(() => null);
    const previewData = live
      ? reconcileMediaForLiveWedding(live.id, parsed.data.weddingData, live.wedding_data)
      : parsed.data.weddingData;

    const payload = buildGuestPreviewPayload(
      {
        draftId: draft.id,
        templateSlug: source.templateSlug,
        token: parsed.data.token,
        appUrl,
        planner,
      },
      previewData
    );

    const doc = await buildRuntimeDocument(source, payload);
    if (!doc) return jsonError(404, "This template package could not be prepared yet.");

    return Response.json({ html: doc.html, payload });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not prepare preview");
  }
}