import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, readBody } from "@/lib/services/helpers";
import {
  deleteUnreferencedMediaKeys,
  isMediaCleanupAllowed,
  normalizeMediaCleanupKeys,
} from "@/lib/services/media-cleanup";
import {
  authorizeMediaDestination,
  mediaScopeErrorResponse,
  readMediaUploadActor,
} from "@/lib/services/media-upload-scope";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

const cleanupSchema = z.object({
  weddingId: z.string().uuid().optional(),
  urls: z.array(z.string().min(1).max(2000)).max(200).default([]),
});

/**
 * Deletes media objects that are no longer referenced.
 *
 * The builder calls this when a gallery item or soundtrack is removed, and may
 * also call it after replacing a portrait. Objects still referenced by the
 * saved draft or the live invitation are kept; the next save retries them.
 *
 * Auth mirrors `/api/uploads`: a guest token for draft folders, or a logged-in
 * owner for a wedding folder. A caller can never clean up another session's or
 * another wedding's objects.
 */
export async function POST(req: Request) {
  try {
    const limit = await consumeRateLimit({
      bucket: "media_cleanup",
      key: clientKey(req),
      limit: 300,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many cleanup requests. Please try again later.");
    }

    const parsed = cleanupSchema.safeParse(await readBody(req));
    if (!parsed.success) {
      return jsonError(400, "Invalid cleanup payload", parsed.error.flatten());
    }

    const admin = createAdminClient();
    const actor = await readMediaUploadActor(req, admin);
    const destination = await authorizeMediaDestination(
      admin,
      actor,
      parsed.data.weddingId ?? null
    );
    if ("error" in destination) return mediaScopeErrorResponse(destination.error);

    const keys = normalizeMediaCleanupKeys(parsed.data.urls).filter((key) =>
      isMediaCleanupAllowed(key, {
        weddingId: destination.weddingId,
        guestToken: actor.guestToken,
      })
    );

    if (keys.length === 0) {
      return Response.json({ deleted: [], kept: [], failures: [] });
    }

    const result = await deleteUnreferencedMediaKeys(keys, {
      weddingId: destination.weddingId,
      guestSessionId: actor.guestDraft?.session_id ?? null,
      admin,
    });

    if (result.failures.length > 0) {
      console.warn("[media-cleanup] could not remove every superseded object", {
        failures: result.failures.slice(0, 5),
      });
    }

    return Response.json(result);
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not clean up media");
  }
}
