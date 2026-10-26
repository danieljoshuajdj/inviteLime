import { z } from "zod";

import { saveGuestDraft } from "@/lib/services/guest";
import { syncActiveWeddingFromDraft } from "@/lib/services/guest-wedding";
import { readBody, jsonError } from "@/lib/services/helpers";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";
import { weddingDraftSchema } from "@/lib/validators";

const saveDraftSchema = z.object({
  token: z.string().min(10),
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid(),
  // Drafts are saved after every step, so they are incomplete by definition
  // (see `weddingDraftSchema`). Full validation happens at publish.
  weddingData: weddingDraftSchema,
  email: z.string().email().optional().nullable(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const parsed = saveDraftSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid draft payload", parsed.error.flatten());
    }

    // The builder autosaves while typing; the ceiling is generous but stops
    // scripted abuse of the guest draft endpoint.
    const limit = await consumeRateLimit({
      bucket: "guest_draft",
      key: clientKey(req),
      limit: 600,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Autosave is temporarily paused. Please retry in a moment.");
    }

    const draft = await saveGuestDraft({
      token: parsed.data.token,
      templateId: parsed.data.templateId,
      templateVersionId: parsed.data.templateVersionId,
      weddingData: parsed.data.weddingData as Record<string, unknown>,
      email: parsed.data.email ?? null,
    });

    // `weddingDraftSchema` fills optional fields with empty defaults. That is
    // useful for a draft, but mirroring those defaults to a live invitation
    // would erase an address or story the couple had already saved. Send only
    // the fields the browser actually included; an explicitly sent empty value
    // still clears the live field.
    const rawWeddingData =
      body && typeof body === "object" && "weddingData" in body
        ? (body as { weddingData?: unknown }).weddingData
        : undefined;
    const syncWeddingData =
      rawWeddingData && typeof rawWeddingData === "object"
        ? Object.fromEntries(
            Object.keys(rawWeddingData).map((key) => [
              key,
              (parsed.data.weddingData as Record<string, unknown>)[key],
            ])
          )
        : (parsed.data.weddingData as Record<string, unknown>);

    // If this session already published, the builder is no longer editing a
    // private draft: mirror the same content onto the live invitation. The
    // sync also replaces pre-publish media URLs a stale tab may still hold.
    const live = await syncActiveWeddingFromDraft({
      sessionId: draft.session_id,
      draftId: draft.id,
      weddingData: syncWeddingData,
    });

    return Response.json({ draft, live });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not save draft");
  }
}