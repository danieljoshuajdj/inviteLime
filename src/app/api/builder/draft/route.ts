import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getOwnedBuilderDraft, saveBuilderDraft } from "@/lib/services/builder";
import { syncActiveWeddingFromDraft } from "@/lib/services/guest-wedding";
import { getCurrentProfile, readBody, jsonError } from "@/lib/services/helpers";
import { mediaKeysInWeddingData } from "@/lib/services/invitation-deletion";
import { deleteUnreferencedMediaKeys } from "@/lib/services/media-cleanup";
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

/**
 * Authenticated builder autosave. The token identifies a draft, but the
 * Supabase session identifies its owner; both must match.
 */
export async function POST(req: Request) {
  try {
    const authClient = await createServerClient();
    const sessionUser = await getCurrentProfile(authClient);
    if (!sessionUser) {
      return jsonError(401, "Sign in to continue editing your invitation.");
    }

    const body = await readBody(req);
    const parsed = saveDraftSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid draft payload", parsed.error.flatten());
    }

    // The builder autosaves while typing; the ceiling is generous but stops
    // scripted abuse of the draft endpoint.
    const limit = await consumeRateLimit({
      bucket: "builder_draft",
      key: sessionUser.user.id || clientKey(req),
      limit: 600,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Autosave is temporarily paused. Please retry in a moment.");
    }

    const admin = createAdminClient();
    // Ownership and the previous content come from the same read. A failed
    // read is an authorization failure, not something to paper over.
    const previousDraft = await getOwnedBuilderDraft(
      admin,
      parsed.data.token,
      sessionUser.user.id
    );
    if (!previousDraft) {
      return jsonError(403, "This draft does not belong to your account.");
    }

    const draft = await saveBuilderDraft({
      token: parsed.data.token,
      userId: sessionUser.user.id,
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

    // The save is committed by now, so anything present in the previous draft/
    // live blob but absent from the saved result is a candidate. Keys that are
    // still displayed are filtered out here and re-checked against the database
    // in any case; a draft upload the user replaced before saving is deleted.
    try {
      const stillUsed = new Set([
        ...mediaKeysInWeddingData(draft.wedding_data),
        ...mediaKeysInWeddingData(live?.data),
      ]);
      const candidates = [
        ...mediaKeysInWeddingData(previousDraft.wedding_data),
        ...mediaKeysInWeddingData(live?.previousData),
      ].filter((key) => !stillUsed.has(key));

      const cleanup = await deleteUnreferencedMediaKeys(candidates, {
        weddingId: live?.id ?? null,
        guestSessionId: draft.session_id,
        draftId: draft.id,
        includeStaleWeddingMedia: Boolean(live),
        admin,
      });

      if (cleanup.failures.length > 0) {
        console.warn("[builder-draft] media cleanup incomplete", {
          failures: cleanup.failures.slice(0, 5),
        });
      }
    } catch (err) {
      // Never fail a save that has already committed because cleanup did not.
      console.warn("[builder-draft] media cleanup failed", err);
    }

    return Response.json({ draft, live });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not save draft");
  }
}
