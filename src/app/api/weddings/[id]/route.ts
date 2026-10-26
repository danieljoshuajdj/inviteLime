import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPhoneDigits } from "@/lib/phone";
import { jsonError, readBody } from "@/lib/services/helpers";
import { UUID_RE } from "@/lib/services/media-access";
import { consumeRateLimit } from "@/lib/services/ops";
import { purgeWedding, WeddingPurgeError } from "@/lib/services/wedding-purge";
import { dressCodeSchema, mediaItemSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  brideName: z.string().trim().min(1).max(120),
  groomName: z.string().trim().min(1).max(120),
  brideBio: z.string().max(2000).optional().default(""),
  groomBio: z.string().max(2000).optional().default(""),
  story: z.string().max(4000).optional().default(""),
  brideDesignation: z.string().trim().max(200).optional(),
  groomDesignation: z.string().trim().max(200).optional(),
  dress: dressCodeSchema,
  rsvpEnabled: z.boolean().optional(),
  rsvpWhatsapp: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === "" || hasPhoneDigits(value), {
      message: "Enter a valid WhatsApp number, including the country code.",
    })
    .optional(),
  weddingDate: z.string().min(1),
  weddingTime: z.string().nullable().optional(),
  venue: z.string().trim().min(1).max(200),
  address: z.string().max(1000).optional().default(""),
  mapsUrl: z.string().url().nullable().optional().or(z.literal("")),
  events: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(120),
        date: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
        venue: z.string().max(200).nullable().optional(),
        address: z.string().max(500).nullable().optional(),
        mapsUrl: z.string().nullable().optional(),
        description: z.string().max(1000).nullable().optional(),
      })
    )
    .max(12)
    .default([]),
  gallery: z.array(mediaItemSchema).max(100).optional(),
  bridePhoto: z.string().trim().max(2000).nullable().optional(),
  groomPhoto: z.string().trim().max(2000).nullable().optional(),
  couplePhoto: z.string().trim().max(2000).nullable().optional(),
  music: mediaItemSchema.nullable().optional(),
});

const deleteSchema = z.object({
  confirm: z.string().trim().min(1).max(200),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Sign in required");

  const { data, error } = await supabase
    .from("weddings")
    .select("id, bride_name, groom_name, wedding_date, wedding_time, venue, address, maps_url, wedding_data, rsvp_toggle, status, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!data) return jsonError(404, "Invitation not found");

  const wd = (data.wedding_data ?? {}) as Record<string, unknown>;
  return Response.json({
    brideName: data.bride_name ?? wd.brideName ?? "",
    groomName: data.groom_name ?? wd.groomName ?? "",
    brideBio: (wd.brideBio as string) ?? "",
    groomBio: (wd.groomBio as string) ?? "",
    story: (wd.story as string) ?? "",
    brideDesignation: (wd.brideDesignation as string) ?? "",
    groomDesignation: (wd.groomDesignation as string) ?? "",
    dress: wd.dress ?? null,
    rsvpEnabled: data.rsvp_toggle,
    rsvpWhatsapp: (wd.rsvpWhatsapp as string) ?? "",
    weddingDate: data.wedding_date ?? wd.weddingDate ?? "",
    weddingTime: data.wedding_time ?? (wd.weddingTime as string | null) ?? null,
    venue: data.venue ?? wd.venue ?? "",
    address: data.address ?? wd.address ?? "",
    mapsUrl: data.maps_url ?? (wd.mapsUrl as string | null) ?? null,
    events: (wd.events as unknown[]) ?? [],
    gallery: Array.isArray(wd.gallery) ? wd.gallery : [],
    bridePhoto: (wd.bridePhoto as string | null) ?? null,
    groomPhoto: (wd.groomPhoto as string | null) ?? null,
    couplePhoto: (wd.couplePhoto as string | null) ?? null,
    music: wd.music ?? null,
    status: data.status,
    slug: data.slug,
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await readBody(req);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid content", parsed.error.flatten());

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Sign in required");

  const { data: existing } = await supabase
    .from("weddings")
    .select("id, wedding_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return jsonError(404, "Invitation not found");

  const prevWData = (existing.wedding_data ?? {}) as Record<string, unknown>;
  const wd = {
    ...prevWData,
    brideName: parsed.data.brideName,
    groomName: parsed.data.groomName,
    brideBio: parsed.data.brideBio,
    groomBio: parsed.data.groomBio,
    story: parsed.data.story,
    events: parsed.data.events,
    ...(parsed.data.brideDesignation !== undefined
      ? { brideDesignation: parsed.data.brideDesignation }
      : {}),
    ...(parsed.data.groomDesignation !== undefined
      ? { groomDesignation: parsed.data.groomDesignation }
      : {}),
    ...(parsed.data.dress !== undefined ? { dress: parsed.data.dress } : {}),
    ...(typeof parsed.data.rsvpEnabled === "boolean"
      ? { rsvpEnabled: parsed.data.rsvpEnabled }
      : {}),
    ...(parsed.data.rsvpWhatsapp !== undefined
      ? { rsvpWhatsapp: parsed.data.rsvpWhatsapp }
      : {}),
    ...(parsed.data.gallery !== undefined ? { gallery: parsed.data.gallery } : {}),
    ...(parsed.data.bridePhoto !== undefined ? { bridePhoto: parsed.data.bridePhoto } : {}),
    ...(parsed.data.groomPhoto !== undefined ? { groomPhoto: parsed.data.groomPhoto } : {}),
    ...(parsed.data.couplePhoto !== undefined ? { couplePhoto: parsed.data.couplePhoto } : {}),
    ...(parsed.data.music !== undefined ? { music: parsed.data.music } : {}),
  };

  const { error } = await supabase
    .from("weddings")
    .update({
      bride_name: parsed.data.brideName,
      groom_name: parsed.data.groomName,
      wedding_date: parsed.data.weddingDate || null,
      wedding_time: parsed.data.weddingTime || null,
      venue: parsed.data.venue,
      address: parsed.data.address || null,
      maps_url: parsed.data.mapsUrl || null,
      ...(typeof parsed.data.rsvpEnabled === "boolean"
        ? { rsvp_toggle: parsed.data.rsvpEnabled }
        : {}),
      wedding_data: wd as never,
    })
    .eq("id", id);
  if (error) return jsonError(500, error.message);

  return Response.json({ ok: true });
}

/**
 * Permanent planner-side deletion. Ownership and role are checked through the
 * caller's session before the service-role purge runs; the typed confirmation
 * must match the live slug (or the id for a slug-less row).
 */
export async function DELETE(req: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(400, "Invalid invitation id");

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body ?? {});
  if (!parsed.success) return jsonError(400, "Invalid payload", parsed.error.flatten());

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Sign in required");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "planner") {
    return jsonError(403, "Only planners can delete invitations from this console.");
  }

  const { data: wedding } = await supabase
    .from("weddings")
    .select("id, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!wedding) return jsonError(404, "Invitation not found");

  const expected = wedding.slug || wedding.id;
  if (parsed.data.confirm !== expected && parsed.data.confirm !== wedding.id) {
    return jsonError(400, "Confirmation does not match this invitation.");
  }

  const limit = await consumeRateLimit({
    bucket: "planner_delete",
    key: user.id,
    limit: 30,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return jsonError(429, "Too many deletions. Please try again later.");
  }

  try {
    const result = await purgeWedding(createAdminClient(), id, {
      actorId: user.id,
      auditAction: "invitation.delete",
      auditMetadata: { trigger: "planner" },
    });
    return Response.json({
      ok: true,
      weddingId: id,
      alreadyDeleted: result.alreadyDeleted,
      slug: result.slug,
      objectsDeleted: result.objectsDeleted,
    });
  } catch (e) {
    if (e instanceof WeddingPurgeError) {
      return jsonError(500, "Invitation could not be deleted.", {
        step: e.step,
        detail: e.message,
        objectsDeleted: e.objectsDeleted,
        ...(e.failures.length > 0 ? { failures: e.failures.slice(0, 5) } : {}),
      });
    }
    return jsonError(500, e instanceof Error ? e.message : "Delete failed");
  }
}