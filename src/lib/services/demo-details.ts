import { createAdminClient } from "@/lib/supabase/admin";
import type { DemoDetailPack, DemoDetailPackEvent } from "@/lib/library-media";

export type { DemoDetailPack, DemoDetailPackEvent };

/**
 * Admin-curated demo details: couple names, venue, events, dress code and
 * code and RSVP contact. The template demo renders them instead of the stock
 * generic dataset; live invitations never read this table.
 *
 * Kept free of imports beyond the Supabase admin client so the normalisation
 * rules can be unit tested directly.
 */

const PACK_COLUMNS =
  "id, name, description, bride_name, groom_name, bride_designation, groom_designation, " +
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
  bride_name: string;
  groom_name: string;
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
  brideName: string;
  groomName: string;
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

/** Validates and normalises an admin-supplied pack payload. */
export function normalizeDemoDetailPackInput(raw: unknown): DemoDetailPackInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const rawEvents = Array.isArray(input.events) ? input.events : [];
  if (rawEvents.length > MAX_EVENTS) {
    throw new DemoDetailValidationError("INVALID_PACK", `A pack can hold at most ${MAX_EVENTS} events`);
  }

  return {
    name: requiredText(input.name, 120, "Pack name"),
    description: text(input.description, 300),
    brideName: requiredText(input.brideName, 120, "Bride name"),
    groomName: requiredText(input.groomName, 120, "Groom name"),
    brideDesignation: text(input.brideDesignation, 200),
    groomDesignation: text(input.groomDesignation, 200),
    brideBio: text(input.brideBio, 2000),
    groomBio: text(input.groomBio, 2000),
    coupleBio: text(input.coupleBio, 2000),
    story: text(input.story, 4000),
    weddingDate: isoDate(input.weddingDate, "Wedding date"),
    weddingTime: isoTime(input.weddingTime, "Wedding time"),
    venue: text(input.venue, 300),
    address: text(input.address, 300),
    mapsUrl: text(input.mapsUrl, 500),
    latitude: coordinate(input.latitude, "Latitude", -90, 90),
    longitude: coordinate(input.longitude, "Longitude", -180, 180),
    dressBrideColor: color(input.dressBrideColor, "Bride dress colour"),
    dressBrideColorName: text(input.dressBrideColorName, 60),
    dressGroomColor: color(input.dressGroomColor, "Groom dress colour"),
    dressGroomColorName: text(input.dressGroomColorName, 60),
    rsvpDeadline: isoDate(input.rsvpDeadline, "Reply-by date"),
    rsvpContactName: text(input.rsvpContactName, 200),
    rsvpContactPhone: text(input.rsvpContactPhone, 40),
    rsvpWhatsapp: text(input.rsvpWhatsapp, 500),
    events: rawEvents.map(normalizeEvent),
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
    brideName: row.bride_name,
    groomName: row.groom_name,
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

function packRow(input: DemoDetailPackInput): Omit<RawPackRow, "id" | "created_at" | "updated_at"> {
  return {
    name: input.name,
    description: input.description,
    bride_name: input.brideName,
    groom_name: input.groomName,
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
  const input = normalizeDemoDetailPackInput(raw);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("demo_detail_packs")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) throw new Error("Demo details pack not found");

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
