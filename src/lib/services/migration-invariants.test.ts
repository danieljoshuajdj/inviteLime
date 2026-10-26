import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Postgres refuses to build an index whose predicate calls a non-immutable
 * function: "functions in index predicate must be marked IMMUTABLE". That
 * failure happens at apply time, so a stray now() in an index silently takes the
 * whole database down with it. These assertions run over the migration text
 * because the project has no runnable database in CI.
 */

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const migrations = files.map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8") }));

/** Statements that begin a CREATE INDEX, including multi-line bodies. */
function indexStatements(sql: string): string[] {
  const out: string[] = [];
  const re = /create\s+(?:unique\s+)?index\s[^;]*;/gi;
  for (const match of sql.matchAll(re)) out.push(match[0]);
  return out;
}

describe("migration files", () => {
  it("finds the migrations", () => {
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("prevent_privilege_escalation", () => {
  const init = migrations.find((m) => m.name === "00001_init.sql")!.sql;
  const body = init.slice(
    init.indexOf("create or replace function public.prevent_privilege_escalation()"),
    init.indexOf("$$;", init.indexOf("create or replace function public.prevent_privilege_escalation()"))
  );

  it("is SECURITY INVOKER so current_user is the caller, not the owner", () => {
    // SECURITY DEFINER here made current_user resolve to postgres, so the
    // service_role branch was unreachable and every role change was rejected.
    expect(body).toMatch(/security invoker/i);
    expect(body).not.toMatch(/security definer/i);
  });

  it("lets the platform server and superuser roles through", () => {
    expect(body).toMatch(/current_user in \('service_role', 'postgres', 'supabase_admin'\)/);
  });

  it("still denies role and status changes to everyone else", () => {
    expect(body).toMatch(/new\.role is distinct from old\.role and not public\.is_admin\(\)/);
    expect(body).toMatch(/new\.status is distinct from old\.status and not public\.is_admin\(\)/);
  });

  it("does not gate on a bare current_user inequality that can never be true", () => {
    expect(body).not.toMatch(/current_user <> 'service_role'/);
  });

  it("is still attached to profiles", () => {
    expect(init).toMatch(
      /create trigger profiles_no_escalation[\s\S]*?before update on public\.profiles[\s\S]*?execute procedure public\.prevent_privilege_escalation\(\)/
    );
  });
});

describe("index predicates are immutable", () => {
  // now(), current_timestamp, current_date, random(), clock_timestamp() and
  // statement_timestamp() are all stable, not immutable.
  const VOLATILE = /\b(now|random|clock_timestamp|statement_timestamp|timeofday)\s*\(\s*\)|\bcurrent_(timestamp|date|time)\b/i;

  for (const { name, sql } of migrations) {
    it(`${name} has no volatile call in an index predicate`, () => {
      const offenders = indexStatements(sql)
        .filter((stmt) => {
          const predicate = stmt.slice(stmt.toLowerCase().indexOf("where"));
          // No predicate at all is fine.
          if (predicate === stmt) return false;
          return VOLATILE.test(predicate);
        })
        .map((stmt) => stmt.split("\n")[0].trim());

      expect(offenders).toEqual([]);
    });
  }

  it("still indexes the guest expiry columns the sweeps rely on", () => {
    const init = migrations.find((m) => m.name === "00001_init.sql")!.sql;
    expect(init).toMatch(/create index if not exists guest_sessions_expiry_idx on public\.guest_sessions \(expires_at\);/);
    expect(init).toMatch(/create index if not exists guest_drafts_expiry_idx on public\.guest_drafts \(expires_at\);/);
  });

  it("still indexes the rate-limit sweep column", () => {
    const hardening = migrations.find((m) => m.name === "00003_hardening.sql")!.sql;
    expect(hardening).toMatch(
      /create index if not exists rate_limit_window_idx\s+on public\.rate_limit_hits \(window_started_at\);/
    );
  });

  it("keeps the partial indexes that only compare constants or columns", () => {
    const init = migrations.find((m) => m.name === "00001_init.sql")!.sql;
    // These predicates are immutable and therefore still legal.
    expect(init).toMatch(/weddings_status_expiry_idx[\s\S]*?where status = 'active'/);
    expect(init).toMatch(/template_versions_current_idx[\s\S]*?where is_current/);
  });
});

describe("public invitation visibility", () => {
  const init = migrations.find((m) => m.name === "00001_init.sql")!.sql;

  it("hides weddings from anonymous reads only while the invitation is live", () => {
    expect(init).toMatch(
      /create policy "weddings_public_active" on public\.weddings\s+for select using \(public\.is_wedding_public\(status, expiration_date\)\)/
    );
  });

  it("gates the child tables on the same rule", () => {
    // wedding_events and wedding_media join back to weddings; a lapsed
    // subscription must not keep exposing them either.
    const childPolicies = init.slice(
      init.indexOf('create policy "events_public"'),
      init.indexOf('create policy "fav_owner_all"')
    );
    const gated = childPolicies.match(/public\.is_wedding_public\(/g) ?? [];
    expect(gated.length).toBe(2);
  });

  it("defines the rule once, as a stable function, using an inclusive date", () => {
    expect(init).toMatch(
      /create or replace function public\.is_wedding_public\(p_status text, p_expiration_date date\)[\s\S]*?language sql[\s\S]*?stable/
    );
    expect(init).toMatch(/p_expiration_date >= current_date/);
  });

  it("never lets public reads bypass the helper with a bare status check", () => {
    const publicPolicies = init.slice(
      init.indexOf('create policy "weddings_owner_select"'),
      init.indexOf('-- favorites: owner only')
    );
    expect(publicPolicies).not.toMatch(/for select using \(status = 'active'\)/);
  });

  it("keeps mark_expired_invitations away from ordinary customers", () => {
    // SECURITY DEFINER + global effect: only the service role may flip statuses.
    expect(init).toMatch(
      /grant execute on function public\.mark_expired_invitations\(\) to service_role;/
    );
    expect(init).not.toMatch(
      /grant execute on function public\.mark_expired_invitations\(\) to authenticated/
    );
  });

  it("leaves the private weddings bucket without a public policy", () => {
    const bucketPolicies = init.slice(
      init.indexOf("-- weddings bucket: private"),
      init.indexOf("-- ============================================================\n-- INDEXES")
    );
    expect(bucketPolicies).not.toMatch(/bucket_id = 'weddings'[\s\S]*?for select using \(true\)/);
  });
});

describe("payment reconciliation", () => {
  const init = migrations.find((m) => m.name === "00001_init.sql")!.sql;
  const webhook = readFileSync(
    resolve(process.cwd(), "src/app/api/payments/webhook/route.ts"),
    "utf8"
  );

  it("keeps one row per provider payment id", () => {
    // The handler dedupes with a check-then-insert, which cannot see an
    // uncommitted concurrent delivery. Only the index makes it safe.
    expect(init).toMatch(
      /create unique index if not exists payments_provider_txn_uniq\s+on public\.payments \(razorpay_payment_id\)\s+where razorpay_payment_id is not null;/
    );
  });

  it("records an order before sending the customer to Razorpay", () => {
    const orders = readFileSync(resolve(process.cwd(), "src/app/api/orders/route.ts"), "utf8");
    expect(orders).toMatch(/const \{ error: orderError \} = await supabase\.from\("orders"\)\.insert\(/);
    expect(orders).toMatch(/if \(orderError\)/);
  });

  it("refuses to publish a payment with no order to reconcile against", () => {
    expect(webhook).toMatch(/if \(!orderRow\) \{[\s\S]*?return Response\.json\(\{ error: "Unknown order" \}, \{ status: 409 \}\)/);
  });

  it("compares the amount unconditionally, not only when an order was found", () => {
    // The old guard was `if (orderRow && ...)`, which silently skipped the
    // whole price check whenever the lookup missed.
    expect(webhook).not.toMatch(/if \(orderRow && /);
    expect(webhook).toMatch(/if \(Number\(payment\.amount \?\? 0\) !== Number\(orderRow\.amount_paise\)\)/);
  });

  it("treats the order row as authoritative over payment notes", () => {
    expect(webhook).toMatch(/const weddingId = orderRow\.wedding_id \?\? notedWeddingId;/);
    expect(webhook).not.toMatch(/const weddingId = notes\.wedding_id \?\?/);
  });

  it("checks the currency as well as the amount", () => {
    expect(webhook).toMatch(/payment\.currency !== orderRow\.currency/);
  });
});

describe("music library migration", () => {
  const sql = migrations.find((m) => m.name === "00009_music_library.sql")!.sql;

  it("exists", () => {
    expect(sql).toBeTruthy();
  });

  it("only uses immutable partial-index predicates", () => {
    // A predicate calling now() fails at apply time and takes the database down
    // with it, so the library indexes must compare constants or columns only.
    for (const stmt of indexStatements(sql)) {
      const where = stmt.slice(stmt.indexOf("where")).toLowerCase();
      expect(where).not.toContain("now()");
      expect(where).not.toContain("current_date");
      expect(where).not.toContain("current_timestamp");
    }
  });

  it("gives active rows a covering index for the picker", () => {
    expect(sql).toMatch(/music_tracks_active_created_idx[\s\S]*?where is_active/);
  });

  it("keeps storage keys unique so a re-upload cannot collide", () => {
    expect(sql).toMatch(/unique index[\s\S]*?music_tracks_storage_key_idx[\s\S]*?on public\.music_tracks \(storage_key\)/);
  });

  it("does not let anonymous callers write to the library", () => {
    // Grants must stay read-only for anon/authenticated; only service_role writes.
    expect(sql).toMatch(/grant select on public\.music_tracks to anon/);
    expect(sql).not.toMatch(/grant all on public\.music_tracks to anon/);
    expect(sql).not.toMatch(/grant insert .* to anon/);
    expect(sql).not.toMatch(/grant update .* to anon/);
    expect(sql).not.toMatch(/grant delete .* to anon/);
  });

  it("enables RLS before defining any policy", () => {
    expect(sql.indexOf("enable row level security")).toBeLessThan(sql.indexOf("create policy"));
  });
});
