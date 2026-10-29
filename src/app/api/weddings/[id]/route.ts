import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPhoneDigits } from "@/lib/phone";
import { jsonError, readBody } from "@/lib/services/helpers";
import { mediaKeysInWeddingData } from "@/lib/services/invitation-deletion";
import { deleteUnreferencedMediaKeys } from "@/lib/services/media-cleanup";
import { UUID_RE } from "@/lib/services/media-access";
import { consumeRateLimit } from "@/lib/services/ops";
import { purgeWedding, WeddingPurgeError } from "@/lib/services/wedding-purge";
import { dressCodeSchema, mediaItemSchema } from "@/lib/validators";
import { normalizeWeddingData } from "@/lib/builder/defaults";
import { formTypeOrDefault, isBirthdayForm } from "@/lib/builder/forms";
import { BIRTHDAY_NUMBER_MAX, BIRTHDAY_NUMBER_MIN, validateDetails } from "@/lib/builder/validation";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  // Couple fields belong to wedding/engagement; birthday fields to the birthday
  // forms. Which set is required is decided by the wedding's frozen form type.
  brideName: z.string().trim().min(1).max(120).optional(),
  groomName: z.string().trim().min(1).max(120).optional(),
  celebrantName: z.string().trim().min(1).max(120).optional(),
  birthdayNumber: z
    .number()
    .int()
    .min(BIRTHDAY_NUMBER_MIN)
    .max(BIRTHDAY_NUMBER_MAX)
    .nullable()
    .optional(),
  specialMessage: z.string().max(2000).optional(),
  mainPhoto: z.string().trim().max(2000).nullable().optional(),
  brideBio: z.string().max(2000).optional(),
  groomBio: z.string().max(2000).optional(),
  story: z.string().max(4000).optional(),
  brideDesignation: z.string().trim().max(200).optional(),
  groomDesignation: z.string().trim().max(200).optional(),
  dress: dressCodeSchema.optional(),
  rsvpEnabled: z.boolean().optional(),
  rsvpWhatsapp: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === "" || hasPhoneDigits(value), {
      message: "Enter a valid WhatsApp number, including the country code.",
    })
    .optional(),
  weddingDate: z.string().min(1).optional(),
  weddingTime: z.string().nullable().optional(),
  venue: z.string().trim().min(1).max(200).optional(),
  address: z.string().max(1000).optional(),
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
    .optional(),
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
    .select("id, form_type, bride_name, groom_name, celebrant_name, wedding_date, wedding_time, venue, address, maps_url, wedding_data, rsvp_toggle, status, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!data) return jsonError(404, "Invitation not found");

  const wd = (data.wedding_data ?? {}) as Record<string, unknown>;
  return Response.json({
    formType: formTypeOrDefault(data.form_type),
    brideName: data.bride_name ?? wd.brideName ?? "",
    groomName: data.groom_name ?? wd.groomName ?? "",
    celebrantName: data.celebrant_name ?? wd.celebrantName ?? "",
    birthdayNumber: typeof wd.birthdayNumber === "number" ? wd.birthdayNumber : null,
    specialMessage: (wd.specialMessage as string) ?? "",
    mainPhoto: (wd.mainPhoto as string | null) ?? null,
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
    .select("id, form_type, guest_session_id, wedding_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return jsonError(404, "Invitation not found");

  // The form was frozen when the draft was created, so the stored value — not
  // the client — decides which fields this edit may change and which are
  // required. A template re-categorised after purchase must not rewrite it.
  const formType = formTypeOrDefault(existing.form_type);
  const birthday = isBirthdayForm(formType);
  const wishes = formType === "birthday_wishes";

  const prevWData = (existing.wedding_data ?? {}) as Record<string, unknown>;
  const wd: Record<string, unknown> = {
    ...prevWData,
    formType,
    ...(!birthday && parsed.data.brideName !== undefined
      ? { brideName: parsed.data.brideName }
      : {}),
    ...(!birthday && parsed.data.groomName !== undefined
      ? { groomName: parsed.data.groomName }
      : {}),
    ...(birthday && parsed.data.celebrantName !== undefined
      ? { celebrantName: parsed.data.celebrantName }
      : {}),
    ...(birthday && parsed.data.birthdayNumber !== undefined
      ? { birthdayNumber: parsed.data.birthdayNumber }
      : {}),
    ...(birthday && parsed.data.specialMessage !== undefined
      ? { specialMessage: parsed.data.specialMessage }
      : {}),
    ...(birthday && parsed.data.mainPhoto !== undefined
      ? { mainPhoto: parsed.data.mainPhoto }
      : {}),
    ...(!birthday && parsed.data.brideBio !== undefined
      ? { brideBio: parsed.data.brideBio }
      : {}),
    ...(!birthday && parsed.data.groomBio !== undefined
      ? { groomBio: parsed.data.groomBio }
      : {}),
    ...(!birthday && parsed.data.story !== undefined ? { story: parsed.data.story } : {}),
    ...(!birthday && parsed.data.events !== undefined ? { events: parsed.data.events } : {}),
    ...(!birthday && parsed.data.dress !== undefined ? { dress: parsed.data.dress } : {}),
    ...(!birthday && typeof parsed.data.rsvpEnabled === "boolean"
      ? { rsvpEnabled: parsed.data.rsvpEnabled }
      : {}),
    ...(!birthday && parsed.data.brideDesignation !== undefined
      ? { brideDesignation: parsed.data.brideDesignation }
      : {}),
    ...(!birthday && parsed.data.groomDesignation !== undefined
      ? { groomDesignation: parsed.data.groomDesignation }
      : {}),
    ...(!birthday && parsed.data.rsvpWhatsapp !== undefined
      ? { rsvpWhatsapp: parsed.data.rsvpWhatsapp }
      : {}),
    ...(parsed.data.gallery !== undefined ? { gallery: parsed.data.gallery } : {}),
    ...(!birthday && parsed.data.bridePhoto !== undefined
      ? { bridePhoto: parsed.data.bridePhoto }
      : {}),
    ...(!birthday && parsed.data.groomPhoto !== undefined
      ? { groomPhoto: parsed.data.groomPhoto }
      : {}),
    ...(!birthday && parsed.data.couplePhoto !== undefined
      ? { couplePhoto: parsed.data.couplePhoto }
      : {}),
    ...(!birthday && parsed.data.music !== undefined ? { music: parsed.data.music } : {}),
    ...(!wishes && parsed.data.weddingDate !== undefined
      ? { weddingDate: parsed.data.weddingDate }
      : {}),
    ...(!wishes && parsed.data.weddingTime !== undefined
      ? { weddingTime: parsed.data.weddingTime }
      : {}),
    ...(!wishes && parsed.data.venue !== undefined ? { venue: parsed.data.venue } : {}),
    ...(!wishes && parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
    ...(!wishes && parsed.data.mapsUrl !== undefined
      ? { mapsUrl: parsed.data.mapsUrl || null }
      : {}),
  };

  // Account edits never fail on a date that has since passed — an existing
  // invitation must remain editable — but they must not blank required fields.
  const issue = validateDetails(normalizeWeddingData(wd), formType, null);
  if (issue) return jsonError(400, issue.message);

  const update: Database["public"]["Tables"]["weddings"]["Update"] = {
    wedding_data: wd as never,
  };
  if (!birthday) {
    if (parsed.data.brideName !== undefined) update.bride_name = parsed.data.brideName;
    if (parsed.data.groomName !== undefined) update.groom_name = parsed.data.groomName;
    if (typeof parsed.data.rsvpEnabled === "boolean") {
      update.rsvp_toggle = parsed.data.rsvpEnabled;
    }
  } else if (parsed.data.celebrantName !== undefined) {
    update.celebrant_name = parsed.data.celebrantName;
  }
  if (!wishes) {
    if (parsed.data.weddingDate !== undefined) update.wedding_date = parsed.data.weddingDate || null;
    if (parsed.data.weddingTime !== undefined) update.wedding_time = parsed.data.weddingTime || null;
    if (parsed.data.venue !== undefined) update.venue = parsed.data.venue;
    if (parsed.data.address !== undefined) update.address = parsed.data.address || null;
    if (parsed.data.mapsUrl !== undefined) update.maps_url = parsed.data.mapsUrl || null;
  }

  const { error } = await supabase
    .from("weddings")
    .update(update)
    .eq("id", id);
  if (error) return jsonError(500, error.message);

  // The update committed, so media that only the previous blob referenced is
  // now unused. Keys still shown in the new blob are filtered out; the cleanup
  // re-checks every reference anyway. `includeStaleWeddingMedia` also clears
  // rows left by an upload the editor replaced or abandoned before saving.
  // Cleanup is best-effort: a storage/logging hiccup must not turn a successful
  // save into an error.
  try {
    const stillUsed = new Set(mediaKeysInWeddingData(wd));
    const removed = mediaKeysInWeddingData(prevWData).filter((key) => !stillUsed.has(key));

    const cleanup = await deleteUnreferencedMediaKeys(removed, {
      weddingId: id,
      guestSessionId: existing.guest_session_id ?? null,
      includeStaleWeddingMedia: true,
      admin: createAdminClient(),
    });

    if (cleanup.failures.length > 0) {
      console.warn("[weddings] media cleanup incomplete", {
        weddingId: id,
        failures: cleanup.failures.slice(0, 5),
      });
    }
  } catch (err) {
    console.warn("[weddings] media cleanup failed", { weddingId: id, error: err });
  }

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