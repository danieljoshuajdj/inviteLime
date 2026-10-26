import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import {
  MediaPackValidationError,
  createMediaPack,
} from "@/lib/services/media-packs";
import { consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/media-packs — creates an empty pack.
 *
 * Photos are uploaded separately once the pack exists, so a rejected photo
 * never leaves a half-created pack behind.
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(300).nullable().optional(),
});

export async function POST(req: Request) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const limit = await consumeRateLimit({
      bucket: "admin_create",
      key: admin.user.id,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return jsonError(429, "Too many create operations. Please slow down.");

    const parsed = createSchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid media pack", parsed.error.flatten());

    const pack = await createMediaPack({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    });

    await logAdminAction(admin.user.id, "media_pack.create", "media_pack", pack.id, {
      name: pack.name,
    });
    return Response.json({ pack }, { status: 201 });
  } catch (e) {
    if (e instanceof MediaPackValidationError) return jsonError(400, e.message, { code: e.code });
    return adminApiError(e);
  }
}
