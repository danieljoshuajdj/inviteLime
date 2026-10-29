import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { jsonError, readBody, requireAdmin } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import {
  DemoDetailValidationError,
  deleteDemoDetailPack,
  updateDemoDetailPack,
} from "@/lib/services/demo-details";
import { consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const eventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  date: z.string().max(100).nullable().optional(),
  time: z.string().max(100).nullable().optional(),
  venue: z.string().max(300).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  mapsUrl: z.string().max(500).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

// The editor always submits the full pack; events are replaced wholesale.
const packSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(300).nullable().optional(),
  // The form decides which fields are required; the service owns that rule.
  formType: z.enum(["wedding", "engagement", "birthday_celebration", "birthday_wishes"]).optional(),
  brideName: z.string().trim().max(120).nullable().optional(),
  groomName: z.string().trim().max(120).nullable().optional(),
  celebrantName: z.string().trim().max(120).nullable().optional(),
  birthdayNumber: z.number().int().min(1).max(150).nullable().optional(),
  specialMessage: z.string().max(4000).nullable().optional(),
  brideDesignation: z.string().max(200).nullable().optional(),
  groomDesignation: z.string().max(200).nullable().optional(),
  brideBio: z.string().max(2000).nullable().optional(),
  groomBio: z.string().max(2000).nullable().optional(),
  coupleBio: z.string().max(2000).nullable().optional(),
  story: z.string().max(4000).nullable().optional(),
  weddingDate: z.string().max(100).nullable().optional(),
  weddingTime: z.string().max(100).nullable().optional(),
  venue: z.string().max(300).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  mapsUrl: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  dressBrideColor: z.string().max(7).nullable().optional(),
  dressBrideColorName: z.string().max(60).nullable().optional(),
  dressGroomColor: z.string().max(7).nullable().optional(),
  dressGroomColorName: z.string().max(60).nullable().optional(),
  rsvpDeadline: z.string().max(100).nullable().optional(),
  rsvpContactName: z.string().max(200).nullable().optional(),
  rsvpContactPhone: z.string().max(40).nullable().optional(),
  rsvpWhatsapp: z.string().max(500).nullable().optional(),
  events: z.array(eventSchema).max(20).optional(),
});

/** PATCH /api/admin/demo-details/:id — replaces a pack and its event list. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid details pack id");

    const parsed = packSchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Invalid details pack", parsed.error.flatten());

    const pack = await updateDemoDetailPack(id, parsed.data);

    await logAdminAction(admin.user.id, "demo_detail_pack.update", "demo_detail_pack", id, {
      name: pack.name,
    });
    return Response.json({ pack });
  } catch (e) {
    if (e instanceof DemoDetailValidationError) {
      return jsonError(400, e.message, { code: e.code });
    }
    const message = e instanceof Error ? e.message : "Update failed";
    if (message === "Demo details pack not found") return jsonError(404, message);
    return adminApiError(e);
  }
}

/**
 * DELETE /api/admin/demo-details/:id
 *
 * Templates using the pack are detached (FK `on delete set null`) and fall back
 * to the stock demo data.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id)) return jsonError(400, "Invalid details pack id");

    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return jsonError(429, "Too many admin operations. Please slow down.");

    await deleteDemoDetailPack(id);
    await logAdminAction(admin.user.id, "demo_detail_pack.delete", "demo_detail_pack", id, {});
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    if (message === "Demo details pack not found") return jsonError(404, message);
    return adminApiError(e);
  }
}
