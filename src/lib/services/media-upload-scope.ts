import type { AdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

import { builderTokenFromCookies, getOwnedBuilderDraft, type BuilderDraft } from "./builder";
import { getActiveGuestWedding } from "./guest-wedding";
import { jsonError } from "./helpers";

/**
 * Shared authentication and scope rules for the two media endpoints:
 *
 *  * `POST /api/uploads` writes a new object, and
 *  * `POST /api/uploads/cleanup` removes a superseded one.
 *
 * Both need the same answer to "whose media is this?". Keeping the rules in one
 * place means a cleanup request cannot reach an object the upload route would
 * have refused, and an account editor's session is resolved identically in both.
 */

export interface MediaUploadActor {
  /** Builder access token, from the cookie or a non-JWT bearer value. */
  builderToken: string | null;
  builderDraft: BuilderDraft | null;
  /** The published invitation this builder session owns, if checkout completed. */
  activeGuestWeddingId: string | null;
  /** Logged-in account user id, from the cookie session or a JWT bearer. */
  userId: string | null;
}

export interface MediaScopeError {
  status: 401 | 403;
  message: string;
}

export async function readMediaUploadActor(
  req: Request,
  admin: AdminClient
): Promise<MediaUploadActor> {
  const cookieToken = builderTokenFromCookies(req.headers.get("cookie"));
  const authHeader = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  // A builder token is an opaque value. A JWT is only treated as a user token
  // when it has the three-part shape, exactly as the upload route always has.
  const builderCandidate =
    cookieToken || (authHeader && !authHeader.includes(".") ? authHeader : null);

  const serverSupabase = await createServerClient();
  const {
    data: { user: sessionUser },
  } = await serverSupabase.auth.getUser();
  let userId = sessionUser?.id ?? null;

  if (!userId && authHeader && authHeader.includes(".")) {
    const { data } = await admin.auth.getUser(authHeader);
    userId = data.user?.id ?? null;
  }

  let builderDraft: BuilderDraft | null = null;
  let activeGuestWeddingId: string | null = null;
  if (builderCandidate && userId) {
    builderDraft = await getOwnedBuilderDraft(admin, builderCandidate, userId);
    if (builderDraft) {
      activeGuestWeddingId =
        (await getActiveGuestWedding(admin, builderDraft.session_id))?.id ?? null;
    }
  }

  return { builderToken: builderCandidate, builderDraft, activeGuestWeddingId, userId };
}

/**
 * Resolves the folder an upload/cleanup belongs to, checking that the caller
 * may use it.
 *
 * An open builder tab omits `weddingId`; once its session has published, the
 * upload belongs in that wedding's folder. Before publishing it stays in the
 * draft folder, which is authorized by the builder token and its account
 * owner together.
 */
export async function authorizeMediaDestination(
  admin: AdminClient,
  actor: MediaUploadActor,
  requestedWeddingId: string | null
): Promise<{ weddingId: string | null } | { error: MediaScopeError }> {
  if (!actor.userId) {
    return { error: { status: 401, message: "Authentication required" } };
  }

  const weddingId = requestedWeddingId ?? actor.activeGuestWeddingId;

  if (weddingId) {
    const belongsToBuilder =
      actor.builderDraft !== null && weddingId === actor.activeGuestWeddingId;
    if (!belongsToBuilder) {
      const { data: wedding } = await admin
        .from("weddings")
        .select("id")
        .eq("id", weddingId)
        .eq("user_id", actor.userId)
        .maybeSingle();
      if (!wedding) return { error: { status: 403, message: "Wedding not owned by you" } };
    }
  } else if (!actor.builderDraft) {
    return { error: { status: 403, message: "Unknown upload scope" } };
  }

  return { weddingId };
}

/** Small helper so route handlers can return the mapped auth error directly. */
export function mediaScopeErrorResponse(error: MediaScopeError): Response {
  return jsonError(error.status, error.message);
}
