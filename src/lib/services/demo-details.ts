import { createAdminClient } from "@/lib/supabase/admin";
import type { DemoDetailPack, DemoDetailPackEvent } from "@/lib/library-media";
import { formDefinition, formTypeOrDefault, isBirthdayForm, type FormType } from "@/lib/builder/forms";
import { isValidBirthdayNumber } from "@/lib/builder/validation";

export type { DemoDetailPack, DemoDetailPackEvent };

/**
 * Admin-curated demo details. A pack mirrors exactly one builder form: couple,
 * venue, events and dress for weddings/engagements, or celebrant, date/venue,
 * age/message for the birthday forms. The template demo renders them instead of
 * the stock generic dataset; live invitations never read this table.
 *
 * Kept free of imports beyond the Supabase admin client so the normalisation
 * rules can be unit tested directly.
 */

const PACK_COLUMNS =
  "id, name, description, form_type, bride_name, groom_name, celebrant_name, " +
  "birthday_number, special_message, bride_designation, groom_designation, " +
  "bride_bio, groom_bio, couple_bio, story, wedding_date, wedding_time, venue, address, " +
  "maps_url, latitude, longitude, " +
  "dress_bride_color, dress_bride_color_name, dress_groom_color, dress_groom_color_name, " +
  "rsvp_deadline, rsvp_contact_name, rsvp_contact_phone, rsvp_whatsapp, created_at, updated_at";

const EVENT_COLUMNS =
  "id, pack_id, name, date, time, venue, address, maps_url, description, sort_order, created_at";

interface RawPackRow {
  id: string;
  name: string;
  description: string | null;
  form_type: FormType | string | null;
  bride_name: string | null;
  groom_name: string | null;
  celebrant_name: string | null;
  birthday_number: number | null;
  special_message: string | null;
  bride_designation: string | null;
  groom_designation: string | null;
  bride_bio: string | null;
  groom_bio: string | null;
  couple_bio: string | null;
  story: string | null;
  wedding_date: string | null;
  wedding_time: string | null;
  venue: string | null;
  address: string | null;
  maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  dress_bride_color: string | null;
  dress_bride_color_name: string | null;
  dress_groom_color: string | null;
  dress_groom_color_name: string | null;
  rsvp_deadline: string | null;
  rsvp_contact_name: string | null;
  rsvp_contact_phone: string | null;
  rsvp_whatsapp: string | null;
  created_at: string;
  updated_at: string;
}

interface RawEventRow {
  id: string;
  pack_id: string;
  name: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  address: string | null;
  maps_url: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface DemoDetailPackEventInput {
  name: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  address: string | null;
  mapsUrl: string | null;
  description: string | null;
  sortOrder: number;
}

export interface DemoDetailPackInput {
  name: string;
  description: string | null;
  formType: FormType;
  brideName: string | null;
  groomName: string | null;
  celebrantName: string | null;
  birthdayNumber: number | null;
  specialMessage: string | null;
  brideDesignation: string | null;
  groomDesignation: string | null;
  brideBio: string | null;
  groomBio: string | null;
  coupleBio: string | null;
  story: string | null;
  weddingDate: string | null;
  weddingTime: string | null;
  venue: string | null;
  address: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  dressBrideColor: string | null;
  dressBrideColorName: string | null;
  dressGroomColor: string | null;
  dressGroomColorName: string | null;
  rsvpDeadline: string | null;
  rsvpContactName: string | null;
  rsvpContactPhone: string | null;
  rsvpWhatsapp: string | null;
  events: DemoDetailPackEventInput[];
}

/** Raised for a rejected admin input; `code` lets the API answer precisely. */
export class DemoDetailValidationError extends Error {
  constructor(
    readonly code: "INVALID_PACK" | "INVALID_COLOR" | "INVALID_COORDINATE",
    message: string
  ) {
    super(message);
    this.name = "DemoDetailValidationError";
  }
}

const MAX_EVENTS = 20;

function text(raw: unknown, max: number): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value.slice(0, max) : null;
}

function requiredText(raw: unknown, max: number, field: string): string {
  const value = text(raw, max);
  if (!value) throw new DemoDetailValidationError("INVALID_PACK", `${field} is required`);
  return value;
}

function color(raw: unknown, field: string): string | null {
  const value = text(raw, 7);
  if (!value) return null;
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new DemoDetailValidationError("INVALID_COLOR", `${field} must be a #rrggbb colour`);
  }
  return value.toLowerCase();
}

/** The admin form uses a date picker, so packs store ISO dates. */
function isoDate(raw: unknown, field: string): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DemoDetailValidationError(
      "INVALID_PACK",
      `${field} must be picked from the date field (YYYY-MM-DD)`
    );
  }
  return value;
}

/** A date the builder form also treats as required (birthday celebration). */
function requiredIsoDate(raw: unknown, field: string): string {
  const value = isoDate(raw, field);
  if (!value) {
    throw new DemoDetailValidationError("INVALID_PACK", `${field} is required`);
  }
  return value;
}

/** The admin form uses a time picker, so packs store 24-hour "HH:MM". */
function isoTime(raw: unknown, field: string): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new DemoDetailValidationError(
      "INVALID_PACK",
      `${field} must be picked from the time field (HH:MM)`
    );
  }
  return value;
}

function coordinate(
  raw: unknown,
  field: string,
  min: number,
  max: number
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new DemoDetailValidationError("INVALID_COORDINATE", `${field} is out of range`);
  }
  return value;
}

function normalizeEvent(raw: unknown, index: number): DemoDetailPackEventInput {
  const event = (raw ?? {}) as Record<string, unknown>;
  return {
    name: requiredText(event.name, 120, `Event ${index + 1} name`),
    date: isoDate(event.date, `Event ${index + 1} date`),
    time: isoTime(event.time, `Event ${index + 1} time`),
    venue: text(event.venue, 300),
    address: text(event.address, 300),
    mapsUrl: text(event.mapsUrl, 500),
    description: text(event.description, 2000),
    sortOrder: index,
  };
}

/** Birthday-wishes age. Mirrors the builder's 1–150 rule. */
function birthdayNumber(raw: unknown): number {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  if (!isValidBirthdayNumber(value)) {
    throw new DemoDetailValidationError(
      "INVALID_PACK",
      "Birthday number must be a whole number between 1 and 150"
    );
  }
  return value;
}

/** Validates and normalises an admin-supplied pack payload. */
export function normalizeDemoDetailPackInput(raw: unknown): DemoDetailPackInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const formType = formTypeOrDefault(input.formType);
  const couple = !isBirthdayForm(formType);
  const celebration = formType === "birthday_celebration";
  const wishes = formType === "birthday_wishes";
  const dateLabel = formDefinition(formType).dateLabel || "Event date";

  const rawEvents = couple && Array.isArray(input.events) ? input.events : [];
  if (rawEvents.length > MAX_EVENTS) {
    throw new DemoDetailValidationError("INVALID_PACK", `A pack can hold at most ${MAX_EVENTS} events`);
  }

  return {
    name: requiredText(input.name, 120, "Pack name"),
    description: text(input.description, 300),
    formType,
    // Couple forms keep the original wedding/engagement fields.
    brideName: couple ? requiredText(input.brideName, 120, "Bride name") : null,
    groomName: couple ? requiredText(input.groomName, 120, "Groom name") : null,
    brideDesignation: couple ? text(input.brideDesignation, 200) : null,
    groomDesignation: couple ? text(input.groomDesignation, 200) : null,
    brideBio: couple ? text(input.brideBio, 2000) : null,
    groomBio: couple ? text(input.groomBio, 2000) : null,
    coupleBio: couple ? text(input.coupleBio, 2000) : null,
    story: couple ? text(input.story, 4000) : null,
    // Birthday forms use the person being celebrated.
    celebrantName: couple
      ? null
      : requiredText(input.celebrantName, 120, "Birthday person's name"),
    birthdayNumber: wishes ? birthdayNumber(input.birthdayNumber) : null,
    specialMessage: wishes ? requiredText(input.specialMessage, 4000, "Special message") : null,
    // Birthday Wishes has no date or place. A celebration keeps one date and
    // venue, mirroring its builder form.
    weddingDate: wishes
      ? null
      : couple
        ? isoDate(input.weddingDate, dateLabel)
        : requiredIsoDate(input.weddingDate, dateLabel),
    weddingTime: wishes ? null : isoTime(input.weddingTime, `${dateLabel === "Event date" ? "Event" : dateLabel.replace(/ date$/i, "")} time`),
    venue: wishes
      ? null
      : celebration
        ? requiredText(input.venue, 300, "Venue")
        : text(input.venue, 300),
    address: wishes ? null : text(input.address, 300),
    mapsUrl: wishes ? null : text(input.mapsUrl, 500),
    latitude: couple ? coordinate(input.latitude, "Latitude", -90, 90) : null,
    longitude: couple ? coordinate(input.longitude, "Longitude", -180, 180) : null,
    dressBrideColor: couple ? color(input.dressBrideColor, "Bride dress colour") : null,
    dressBrideColorName: couple ? text(input.dressBrideColorName, 60) : null,
    dressGroomColor: couple ? color(input.dressGroomColor, "Groom dress colour") : null,
    dressGroomColorName: couple ? text(input.dressGroomColorName, 60) : null,
    rsvpDeadline: couple ? isoDate(input.rsvpDeadline, "Reply-by date") : null,
    rsvpContactName: couple ? text(input.rsvpContactName, 200) : null,
    rsvpContactPhone: couple ? text(input.rsvpContactPhone, 40) : null,
    rsvpWhatsapp: couple ? text(input.rsvpWhatsapp, 500) : null,
    events: couple ? rawEvents.map(normalizeEvent) : [],
  };
}

function mapEvent(row: RawEventRow): DemoDetailPackEvent {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    time: row.time,
    venue: row.venue,
    address: row.address,
    mapsUrl: row.maps_url,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

function mapPack(
  row: RawPackRow,
  events: DemoDetailPackEvent[],
  templateCount: number
): DemoDetailPack {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    formType: formTypeOrDefault(row.form_type),
    brideName: row.bride_name,
    groomName: row.groom_name,
    celebrantName: row.celebrant_name,
    birthdayNumber: row.birthday_number,
    specialMessage: row.special_message,
    brideDesignation: row.bride_designation,
    groomDesignation: row.groom_designation,
    brideBio: row.bride_bio,
    groomBio: row.groom_bio,
    coupleBio: row.couple_bio,
    story: row.story,
    weddingDate: row.wedding_date,
    weddingTime: row.wedding_time,
    venue: row.venue,
    address: row.address,
    mapsUrl: row.maps_url,
    latitude: row.latitude,
    longitude: row.longitude,
    dressBrideColor: row.dress_bride_color,
    dressBrideColorName: row.dress_bride_color_name,
    dressGroomColor: row.dress_groom_color,
    dressGroomColorName: row.dress_groom_color_name,
    rsvpDeadline: row.rsvp_deadline,
    rsvpContactName: row.rsvp_contact_name,
    rsvpContactPhone: row.rsvp_contact_phone,
    rsvpWhatsapp: row.rsvp_whatsapp,
    events,
    templateCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The writable shape of a pack row. `form_type` is non-null on insert/update
 * (the column defaults to `wedding` for legacy rows), which is narrower than
 * the read shape where old databases may still report null.
 */
type PackWriteRow = Omit<RawPackRow, "id" | "created_at" | "updated_at" | "form_type"> & {
  form_type: FormType;
};

function packRow(input: DemoDetailPackInput): PackWriteRow {
  return {
    name: input.name,
    description: input.description,
    form_type: input.formType,
    bride_name: input.brideName,
    groom_name: input.groomName,
    celebrant_name: input.celebrantName,
    birthday_number: input.birthdayNumber,
    special_message: input.specialMessage,
    bride_designation: input.brideDesignation,
    groom_designation: input.groomDesignation,
    bride_bio: input.brideBio,
    groom_bio: input.groomBio,
    couple_bio: input.coupleBio,
    story: input.story,
    wedding_date: input.weddingDate,
    wedding_time: input.weddingTime,
    venue: input.venue,
    address: input.address,
    maps_url: input.mapsUrl,
    latitude: input.latitude,
    longitude: input.longitude,
    dress_bride_color: input.dressBrideColor,
    dress_bride_color_name: input.dressBrideColorName,
    dress_groom_color: input.dressGroomColor,
    dress_groom_color_name: input.dressGroomColorName,
    rsvp_deadline: input.rsvpDeadline,
    rsvp_contact_name: input.rsvpContactName,
    rsvp_contact_phone: input.rsvpContactPhone,
    rsvp_whatsapp: input.rsvpWhatsapp,
  };
}

function eventRow(packId: string, event: DemoDetailPackEventInput) {
  return {
    pack_id: packId,
    name: event.name,
    date: event.date,
    time: event.time,
    venue: event.venue,
    address: event.address,
    maps_url: event.mapsUrl,
    description: event.description,
    sort_order: event.sortOrder,
  };
}

/** Lists every pack with its events and how many templates use it. */
export async function listDemoDetailPacks(): Promise<DemoDetailPack[]> {
  const admin = createAdminClient();
  const [packsRes, eventsRes, templatesRes] = await Promise.all([
    admin.from("demo_detail_packs").select(PACK_COLUMNS).order("created_at", { ascending: false }),
    admin
      .from("demo_detail_pack_events")
      .select(EVENT_COLUMNS)
      .order("sort_order", { ascending: true }),
    // Best-effort usage count: a failed read degrades to "0 templates", which
    // only softens the delete warning.
    admin
      .from("templates")
      .select("demo_detail_pack_id")
      .not("demo_detail_pack_id", "is", null),
  ]);

  if (packsRes.error) throw new Error(packsRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const eventsByPack = new Map<string, DemoDetailPackEvent[]>();
  for (const row of (eventsRes.data ?? []) as unknown as RawEventRow[]) {
    const list = eventsByPack.get(row.pack_id) ?? [];
    list.push(mapEvent(row));
    eventsByPack.set(row.pack_id, list);
  }

  const counts = new Map<string, number>();
  for (const row of (templatesRes.data ?? []) as Array<{ demo_detail_pack_id: string | null }>) {
    if (!row.demo_detail_pack_id) continue;
    counts.set(row.demo_detail_pack_id, (counts.get(row.demo_detail_pack_id) ?? 0) + 1);
  }

  return ((packsRes.data ?? []) as unknown as RawPackRow[]).map((row) =>
    mapPack(row, eventsByPack.get(row.id) ?? [], counts.get(row.id) ?? 0)
  );
}

/** One pack for rendering a demo; null when it no longer exists. */
export async function getDemoDetailPack(id: string): Promise<DemoDetailPack | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("demo_detail_packs")
    .select(PACK_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: eventRows, error: eventError } = await admin
    .from("demo_detail_pack_events")
    .select(EVENT_COLUMNS)
    .eq("pack_id", id)
    .order("sort_order", { ascending: true });
  if (eventError) throw new Error(eventError.message);

  const { count } = await admin
    .from("templates")
    .select("id", { count: "exact", head: true })
    .eq("demo_detail_pack_id", id);

  return mapPack(
    data as unknown as RawPackRow,
    ((eventRows ?? []) as unknown as RawEventRow[]).map(mapEvent),
    count ?? 0
  );
}

export async function createDemoDetailPack(raw: unknown): Promise<DemoDetailPack> {
  const input = normalizeDemoDetailPackInput(raw);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("demo_detail_packs")
    .insert(packRow(input))
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (input.events.length > 0) {
    const { error: eventError } = await admin
      .from("demo_detail_pack_events")
      .insert(input.events.map((event) => eventRow(data.id, event)));
    if (eventError) {
      // Never leave a half-created pack behind.
      await admin.from("demo_detail_packs").delete().eq("id", data.id);
      throw new Error(eventError.message);
    }
  }

  const pack = await getDemoDetailPack(data.id);
  if (!pack) throw new Error("Demo details pack could not be read back");
  return pack;
}

export async function updateDemoDetailPack(id: string, raw: unknown): Promise<DemoDetailPack> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("demo_detail_packs")
    .select("id, form_type")
    .eq("id", id)
    .maybeSingle();
  if (!existing) throw new Error("Demo details pack not found");

  // The category of a pack cannot change. A client that omits `formType`
  // (older API callers) must update the pack in its existing form rather than
  // silently converting it to a wedding pack.
  const payload =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (payload.formType === undefined || payload.formType === null || payload.formType === "") {
    payload.formType = existing.form_type ?? "wedding";
  }
  const input = normalizeDemoDetailPackInput(payload);

  const { error } = await admin.from("demo_detail_packs").update(packRow(input)).eq("id", id);
  if (error) throw new Error(error.message);

  // Events are replaced wholesale: the pack editor always submits the full
  // list, and order is part of the content.
  const { error: clearError } = await admin
    .from("demo_detail_pack_events")
    .delete()
    .eq("pack_id", id);
  if (clearError) throw new Error(clearError.message);

  if (input.events.length > 0) {
    const { error: eventError } = await admin
      .from("demo_detail_pack_events")
      .insert(input.events.map((event) => eventRow(id, event)));
    if (eventError) throw new Error(eventError.message);
  }

  const pack = await getDemoDetailPack(id);
  if (!pack) throw new Error("Demo details pack could not be read back");
  return pack;
}

/** Deletes a pack and its events; templates using it are detached by the FK. */
export async function deleteDemoDetailPack(id: string): Promise<void> {
  const admin = createAdminClient();
  // Delete events explicitly as well as via the FK cascade, so older schemas
  // cannot leave orphan rows behind after the pack disappears.
  const { error: eventsError } = await admin
    .from("demo_detail_pack_events")
    .delete()
    .eq("pack_id", id);
  if (eventsError) throw new Error(eventsError.message);

  const { data, error } = await admin
    .from("demo_detail_packs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Demo details pack not found");
}
