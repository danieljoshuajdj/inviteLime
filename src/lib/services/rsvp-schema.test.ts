import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The RSVP write path broke because the application assumed a uniqueness
 * constraint the database could not offer to PostgREST. These assertions pin the
 * two sides together so the same drift cannot come back silently. They read the
 * migration as text because the project has no runnable database in CI.
 */

const MIGRATION = resolve(process.cwd(), "supabase/migrations/00001_init.sql");
const PHONE_MIGRATION = resolve(process.cwd(), "supabase/migrations/00016_rsvp_phone.sql");
const ROUTE = resolve(process.cwd(), "src/app/api/rsvp/route.ts");
const SERVICE = resolve(process.cwd(), "src/lib/services/rsvp.ts");

const sql = readFileSync(MIGRATION, "utf8");
const phoneSql = readFileSync(PHONE_MIGRATION, "utf8");
const route = readFileSync(ROUTE, "utf8");
const service = readFileSync(SERVICE, "utf8");

function functionBody(name: string, source = sql): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must exist in the migration`).toBeGreaterThan(-1);
  const end = source.indexOf("$$;", start);
  expect(end, `${name} must be closed`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("rsvp_responses uniqueness", () => {
  it("indexes lower(email) so the guarantee is case-insensitive", () => {
    expect(sql).toMatch(
      /create unique index rsvp_responses_wedding_email_idx[\s\S]*?\(wedding_id,\s*lower\(email\)\)/
    );
  });

  it("keeps the index partial so email-less guests are never deduplicated", () => {
    expect(sql).toMatch(
      /create unique index rsvp_responses_wedding_email_idx[\s\S]*?where email is not null;/
    );
  });
});

describe("submit_rsvp", () => {
  const body = () => functionBody("submit_rsvp", phoneSql);

  it("is security definer with a pinned search_path", () => {
    expect(body()).toMatch(/security definer/i);
    expect(body()).toMatch(/set search_path = public/i);
  });

  it("stores the guest phone number", () => {
    expect(phoneSql).toMatch(/add column if not exists phone text/i);
    expect(phoneSql).toMatch(
      /drop function if exists public\.submit_rsvp\(uuid, text, text, text, int, text, text\)/
    );
    expect(body()).toMatch(/p_phone text/);
    expect(body()).toMatch(/v_phone := nullif\(btrim\(coalesce\(p_phone/);
    expect(body()).toMatch(/insert into public\.rsvp_responses[\s\S]*?phone/);
  });

  it("re-checks invitation state because anon can call it directly", () => {
    const fn = body();
    expect(fn).toMatch(/status = 'active' and w\.rsvp_toggle/);
    expect(fn).toMatch(/rsvp_deadline is not null and v_wedding\.rsvp_deadline < now\(\)/);
  });

  it("rejects a blank guest name", () => {
    expect(body()).toMatch(/raise exception 'Guest name is required'/);
  });

  it("folds a repeat submission into the existing row", () => {
    const fn = body();
    expect(fn).toMatch(/update public\.rsvp_responses r[\s\S]*?lower\(r\.email\) = v_email/);
  });

  it("recovers when a concurrent submission wins the insert race", () => {
    expect(body()).toMatch(/when unique_violation then/);
  });

  it("is executable by service_role, which is the client the route uses", () => {
    expect(phoneSql).toMatch(
      /grant execute on function public\.submit_rsvp\(uuid, text, text, text, text, int, text, text\)\s+to [^;]*service_role/
    );
  });
});

describe("application write path", () => {
  it("no longer asks PostgREST to resolve a partial index via onConflict", () => {
    // SQLSTATE 42P10: there is no unique or exclusion constraint matching the
    // ON CONFLICT specification. A partial index can never be inferred.
    expect(route).not.toMatch(/onConflict/);
  });

  it("writes through submit_rsvp instead of touching the table", () => {
    expect(route).toMatch(/submitRsvpResponse\(/);
    expect(route).not.toMatch(/from\("rsvp_responses"\)\.(upsert|insert)/);
  });

  it("normalizes the address before the function sees it", () => {
    expect(service).toMatch(/p_email:\s*normalizeRsvpEmail\(input\.email\)/);
  });
});
