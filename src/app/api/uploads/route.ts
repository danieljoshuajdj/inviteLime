import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { guestTokenFromCookies, getGuestDraft, type GuestDraft } from "@/lib/services/guest";
import { getActiveGuestWedding } from "@/lib/services/guest-wedding";
import { saveWeddingMedia, type MediaRole } from "@/lib/services/storage";
import { mediaFolderForGuest } from "@/lib/services/media-access";
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
 */
export async function POST(req: Request) {
  try {
    const cookieToken = guestTokenFromCookies(req.headers.get("cookie"));
    const authHeader = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

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

    // Determine guest token or authenticated user
    const guestCandidate = cookieToken || (authHeader && !authHeader.includes(".") ? authHeader : null);
    const admin = createAdminClient();
    let guestDraft: GuestDraft | null = null;
    let activeGuestWeddingId: string | null = null;
    if (guestCandidate) {
      guestDraft = await getGuestDraft(admin, guestCandidate);
      if (guestDraft) {
        activeGuestWeddingId = (await getActiveGuestWedding(admin, guestDraft.session_id))?.id ?? null;
      }
    }

    // Check user session
    const serverSupabase = await createServerClient();
    const { data: { user: sessionUser } } = await serverSupabase.auth.getUser();
    let authenticatedUser = sessionUser;
    if (!authenticatedUser && authHeader && authHeader.includes(".")) {
      const { data: user } = await admin.auth.getUser(authHeader);
      authenticatedUser = user.user;
    }

    if (!guestDraft && !authenticatedUser) {
      return jsonError(401, "Authentication required");
    }

    const requestedWeddingId: string | null = parsed.data.weddingId || null;
    // An open builder tab does not pass a wedding id; once the session has a
    // published invitation, uploads belong in that wedding's folder so the new
    // file is readable by guests. Before publishing they stay in the draft
    // folder, where the preview's signed URLs can reach them.
    const weddingId: string | null = requestedWeddingId ?? activeGuestWeddingId;

    if (weddingId) {
      const belongsToGuest = guestDraft !== null && weddingId === activeGuestWeddingId;
      if (!belongsToGuest) {
        if (!authenticatedUser) {
          return jsonError(403, "Wedding does not belong to this session");
        }
        const { data: wedding } = await admin
          .from("weddings")
          .select("id")
          .eq("id", weddingId)
          .eq("user_id", authenticatedUser.id)
          .maybeSingle();
        if (!wedding) return jsonError(403, "Wedding not owned by you");
      }
    } else if (!guestDraft) {
      return jsonError(403, "Unknown upload scope");
    }

    const buffer = await file.arrayBuffer();
    const salt = Number(formData.get("salt") ?? "1");
    const role = parsed.data.role as MediaRole;
    // Draft uploads live under a folder derived from the guest session; once a
    // wedding exists the folder is the wedding id, which is what /api/media
    // authorizes published invitations against.
    const folder = weddingId
      ? weddingId
      : mediaFolderForGuest(guestCandidate ?? "anon", role, salt);

    const result = await saveWeddingMedia({
      userId: authenticatedUser?.id ?? null,
      guestToken: guestCandidate ?? null,
      weddingId,
      weddingGuid: folder,
      role,
      fileName: file.name,
      contentType: file.type,
      buffer,
    });

    return Response.json({ url: result.publicUrl, path: result.path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const known = ["UNSUPPORTED_FILE_TYPE", "FILE_TOO_LARGE"];
    return jsonError(known.includes(message) ? 400 : 500, message);
  }
}