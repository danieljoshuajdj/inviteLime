import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { mediaFolderForGuest, parseMediaPath } from "@/lib/services/media-access";
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
import { saveWeddingMedia, type MediaRole } from "@/lib/services/storage";
import { jsonError } from "@/lib/services/helpers";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

const formSchema = z.object({
  weddingId: z.string().uuid().optional(),
  role: z.enum(["bride", "groom", "couple", "gallery", "music", "video"]),
});

/**
 * Authenticated upload of wedding media.
 * Auth: guest token (builder) OR the logged-in owner (account editor).
 *
 * The optional `replaces` field names the object the new upload supersedes
 * (e.g. the previous portrait). After the new object is safely stored, the old
 * one is deleted only when no saved draft, live invitation or `wedding_media`
 * row still points at it.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const roleRaw = String(formData.get("role") ?? "");
    const weddingIdRaw = String(formData.get("weddingId") ?? "");
    const parsed = formSchema.safeParse({ role: roleRaw, weddingId: weddingIdRaw || undefined });
    if (!parsed.success) return jsonError(400, "Invalid upload form", parsed.error.flatten());

    const file = formData.get("file");
    if (!(file instanceof File)) return jsonError(400, "Missing file");
    if (file.size === 0) return jsonError(400, "Empty file");

    const limit = await consumeRateLimit({
      bucket: "upload",
      key: clientKey(req),
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many uploads from this device. Please try again later.");
    }

    const admin = createAdminClient();
    const actor = await readMediaUploadActor(req, admin);
    const destination = await authorizeMediaDestination(
      admin,
      actor,
      parsed.data.weddingId ?? null
    );
    if ("error" in destination) return mediaScopeErrorResponse(destination.error);

    const weddingId = destination.weddingId;
    const buffer = await file.arrayBuffer();
    const salt = Number(formData.get("salt") ?? "1");
    const role = parsed.data.role as MediaRole;
    // Draft uploads live under a folder derived from the guest session; once a
    // wedding exists the folder is the wedding id, which is what /api/media
    // authorizes published invitations against.
    const folder = weddingId
      ? weddingId
      : mediaFolderForGuest(actor.guestToken ?? "anon", role, salt);

    const result = await saveWeddingMedia({
      userId: actor.userId,
      guestToken: actor.guestToken,
      weddingId,
      weddingGuid: folder,
      role,
      fileName: file.name,
      contentType: file.type,
      buffer,
    });

    // A single-file upload supersedes the previous object. The client sends it
    // explicitly for draft folders (where no `wedding_media` row exists); rows
    // superseded by `saveWeddingMedia` are returned for account/editor uploads.
    const replaceCandidates = [
      String(formData.get("replaces") ?? "").trim(),
      ...result.replacedPaths,
    ];
    const replaceKeys = normalizeMediaCleanupKeys(replaceCandidates).filter((key) => {
      if (key === result.path) return false;
      const parsedKey = parseMediaPath(key.split("/"));
      return parsedKey?.role === role;
    });

    if (replaceKeys.length > 0) {
      const allowed = replaceKeys.filter((key) =>
        isMediaCleanupAllowed(key, {
          weddingId,
          guestToken: actor.guestToken,
        })
      );

      if (allowed.length > 0) {
        try {
          const cleanup = await deleteUnreferencedMediaKeys(allowed, {
            weddingId,
            guestSessionId: actor.guestDraft?.session_id ?? null,
            admin,
          });
          if (cleanup.failures.length > 0) {
            console.warn("[uploads] replaced media cleanup incomplete", {
              failures: cleanup.failures.slice(0, 5),
            });
          }
        } catch (err) {
          // The upload itself succeeded; a later save retries the cleanup.
          console.warn("[uploads] replaced media cleanup failed", err);
        }
      }
    }

    return Response.json({ url: result.publicUrl, path: result.path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const known = ["UNSUPPORTED_FILE_TYPE", "FILE_TOO_LARGE"];
    return jsonError(known.includes(message) ? 400 : 500, message);
  }
}
