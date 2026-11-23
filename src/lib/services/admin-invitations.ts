import type { Supabase } from "./helpers";
import { formTypeOrDefault, isBirthdayForm } from "@/lib/builder/forms";

/**
 * Read model for the admin "Invitations" tab.
 *
 * Kept separate from the page so the filter parsing and the PostgREST query
 * shaping can be unit tested without a live Supabase instance.
 */

export const INVITATION_STATUSES = ["draft", "active", "expired", "cancelled"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const PER_PAGE = 25;

export interface InvitationFilters {
  /** Free-text match against email, couple names and slug. */
  q: string;
  status: InvitationStatus | "all";
  /** Inclusive ISO date (yyyy-mm-dd) lower bound on created_at. */
  from: string | null;
  /** Inclusive ISO date (yyyy-mm-dd) upper bound on created_at. */
  to: string | null;
  page: number;
}

export interface InvitationEmailRow {
  templateKey: string;
  toEmail: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface InvitationRow {
  id: string;
  slug: string | null;
  couple: string;
  brideName: string | null;
  groomName: string | null;
  celebrantName: string | null;
  formType: string;
  email: string | null;
  status: InvitationStatus;
  templateName: string | null;
  templateSlug: string | null;
  createdAt: string;
  publishedAt: string | null;
  /** Host date / when the link stops serving. */
  expirationDate: string | null;
  mediaCount: number;
  rsvpCount: number;
  emails: InvitationEmailRow[];
}

export interface InvitationListResult {
  rows: InvitationRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Escapes the characters PostgREST treats as filter syntax. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[%_,().\\]/g, (c) => `\\${c}`);
}

/**
 * Builds the filter set from raw query params. Unknown or malformed values are
 * ignored rather than rejected, so a hand-edited URL degrades to the default
 * view instead of erroring.
 */
export function parseInvitationFilters(params: Record<string, string | string[] | undefined>): InvitationFilters {
  const first = (v: string | string[] | undefined): string | null => {
    const value = Array.isArray(v) ? v[0] : v;
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const q = (first(params.q) ?? "").trim().slice(0, 120);
  const rawStatus = first(params.status);
  const status = INVITATION_STATUSES.includes(rawStatus as InvitationStatus)
    ? (rawStatus as InvitationStatus)
    : "all";

  const fromRaw = first(params.from);
  const toRaw = first(params.to);

  const rawPage = Number(first(params.page) ?? "1");
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(Math.floor(rawPage), 10000) : 1;

  return {
    q,
    status,
    from: fromRaw && ISO_DATE_RE.test(fromRaw) ? fromRaw : null,
    to: toRaw && ISO_DATE_RE.test(toRaw) ? toRaw : null,
    page,
  };
}

/** True when anything is narrowing the list away from "everything". */
export function hasActiveFilters(f: InvitationFilters): boolean {
  return Boolean(f.q) || f.status !== "all" || Boolean(f.from) || Boolean(f.to);
}

export function offsetFor(f: InvitationFilters): number {
  return (f.page - 1) * PER_PAGE;
}

/** Serializes filters back into query params for pagination links. */
export function toQueryString(f: InvitationFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.status !== "all") params.set("status", f.status);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface RawWeddingRow {
  id: string;
  slug: string | null;
  form_type: string | null;
  bride_name: string | null;
  groom_name: string | null;
  celebrant_name: string | null;
  email: string | null;
  status: InvitationStatus;
  created_at: string;
  published_at: string | null;
  expiration_date: string | null;
  template: { name: string; slug: string } | { name: string; slug: string }[] | null;
  wedding_media: { count: number }[] | null;
  rsvp_responses: { count: number }[] | null;
  email_deliveries: {
    template_key: string;
    to_email: string;
    status: string;
    sent_at: string | null;
    created_at: string;
  }[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function countOf(value: { count: number }[] | null): number {
  return value?.[0]?.count ?? 0;
}

function mapRow(row: RawWeddingRow): InvitationRow {
  const template = firstOf(row.template);
  const emails = (row.email_deliveries ?? [])
    .slice()
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  const couple = [row.groom_name, row.bride_name].filter(Boolean).join(" & ");
  const formType = formTypeOrDefault(row.form_type);
  const displayName = isBirthdayForm(formType)
    ? row.celebrant_name?.trim() || "Birthday Star"
    : couple;

  return {
    id: row.id,
    slug: row.slug,
    couple: displayName || "—",
    brideName: row.bride_name,
    groomName: row.groom_name,
    celebrantName: row.celebrant_name,
    formType,
    email: row.email,
    status: row.status,
    templateName: template?.name ?? null,
    templateSlug: template?.slug ?? null,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    expirationDate: row.expiration_date,
    mediaCount: countOf(row.wedding_media),
    rsvpCount: countOf(row.rsvp_responses),
    emails: emails.map((e) => ({
      templateKey: e.template_key,
      toEmail: e.to_email,
      status: e.status,
      sentAt: e.sent_at,
      createdAt: e.created_at,
    })),
  };
}

const SELECT = `
  id, slug, form_type, bride_name, groom_name, celebrant_name, email, status, created_at, published_at, expiration_date,
  template: templates(name, slug),
  wedding_media(count),
  rsvp_responses(count),
  email_deliveries(template_key, to_email, status, sent_at, created_at)
`;

/**
 * Lists invitations newest-first with optional search and filters.
 *
 * `total` is fetched separately because the row query embeds counts, and a
 * count over the embedded joins would over-count rows.
 */
export async function listInvitations(
  supabase: Supabase,
  filters: InvitationFilters
): Promise<InvitationListResult> {
  let query = supabase.from("weddings").select(SELECT, { count: "exact" });

  if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.q) {
    // One OR group across the searchable columns. The leading `%` makes this
    // a substring match, so it is a sequential scan regardless of the btree
    // index on lower(email). That is fine at current volume; if search ever
    // needs to be index-backed, the fix is a pg_trgm GIN index on the
    // searchable columns, not this pattern.
    const like = `%${escapeLikeTerm(filters.q.toLowerCase())}%`;
    query = query.or(
      `email.ilike.${like},slug.ilike.${like},bride_name.ilike.${like},groom_name.ilike.${like},celebrant_name.ilike.${like}`
    );
  }

  if (filters.from) {
    query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  }
  if (filters.to) {
    // Inclusive of the whole end day.
    query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offsetFor(filters), offsetFor(filters) + PER_PAGE - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as RawWeddingRow[]).map(mapRow);
  const total = count ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return {
    rows,
    total,
    page: filters.page,
    perPage: PER_PAGE,
    pageCount,
  };
}