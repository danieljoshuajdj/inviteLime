import { beforeEach, describe, expect, it, vi } from "vitest";

const EXPIRED_ID = "11111111-1111-4111-8111-111111111111";
const CANCELLED_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_OLD_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_PAID_ID = "44444444-4444-4444-8444-444444444444";
const DRAFT_FRESH_ID = "55555555-5555-4555-8555-555555555555";

const FREE_TOKEN = "f".repeat(64);
const DRAFT_SESSION_TOKEN = "d".repeat(64);
const WEDDING_SESSION_TOKEN = "w".repeat(64);

const DAY = 86_400_000;
const OLD_ISO = new Date(Date.now() - 10 * DAY).toISOString();
const OLD_DATE = OLD_ISO.slice(0, 10);
const FRESH_ISO = new Date(Date.now() - 3_600_000).toISOString();
const LIVE_DRAFT_ISO = new Date(Date.now() + DAY).toISOString();

interface Row {
  id?: string;
  [key: string]: unknown;
}

type FilterKind = "eq" | "lt" | "gt" | "in";

interface Filter {
  kind: FilterKind;
  column: string;
  value: unknown;
}

/** String comparison is enough: every column filtered on is text (ISO or date). */
function matches(row: Row, filter: Filter): boolean {
  const cell = row[filter.column];
  switch (filter.kind) {
    case "eq":
      return cell === filter.value;
    case "in":
      return (filter.value as unknown[]).includes(cell);
    case "lt":
      return cell != null && String(cell) < String(filter.value);
    case "gt":
      return cell != null && String(cell) > String(filter.value);
  }
}

class FakeQuery {
  private filters: Filter[] = [];

  constructor(
    private readonly table: string,
    private readonly db: FakeDb
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ kind: "lt", column, value });
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push({ kind: "gt", column, value });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, value: values });
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  then<TResult>(onfulfilled?: (v: { data: Row[]; error: null }) => TResult | PromiseLike<TResult>) {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private resolve() {
    const rows = this.db.rows[this.table] ?? [];
    return {
      data: rows.filter((row) => this.filters.every((filter) => matches(row, filter))),
      error: null,
    };
  }
}

interface FakeDb {
  rows: Record<string, Row[]>;
  from(table: string): FakeQuery;
  rpc: ReturnType<typeof vi.fn>;
}

const rpc = vi.fn(async (fn: string) => {
  if (fn === "mark_expired_invitations") return { data: 1, error: null };
  if (fn === "cleanup_expired_guest_data") {
    return { data: { guest_drafts: 5, guest_sessions: 4, rate_limit_counters: 2 }, error: null };
  }
  return { data: null, error: { message: `unexpected rpc ${fn}` } };
});

const db: FakeDb = {
  rows: {},
  from(table: string) {
    return new FakeQuery(table, db);
  },
  rpc,
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("@/lib/services/wedding-purge", () => ({
  purgeWedding: vi.fn(),
  purgeGuestSessionFolders: vi.fn(),
}));

import { runMaintenance } from "./ops";
import { purgeGuestSessionFolders, purgeWedding } from "./wedding-purge";

function seed() {
  db.rows = {
    weddings: [
      {
        id: EXPIRED_ID,
        status: "expired",
        expiration_date: OLD_DATE,
        created_at: OLD_ISO,
        updated_at: OLD_ISO,
        guest_session_id: null,
      },
      {
        id: CANCELLED_ID,
        status: "cancelled",
        expiration_date: OLD_DATE,
        created_at: OLD_ISO,
        updated_at: OLD_ISO,
        guest_session_id: null,
      },
      {
        id: DRAFT_OLD_ID,
        status: "draft",
        expiration_date: null,
        created_at: OLD_ISO,
        updated_at: OLD_ISO,
        guest_session_id: null,
      },
      {
        id: DRAFT_PAID_ID,
        status: "draft",
        expiration_date: null,
        created_at: OLD_ISO,
        updated_at: OLD_ISO,
        guest_session_id: null,
      },
      {
        // Recently created and still pinned to a live session: never a
        // candidate, and it is what protects that session's folder.
        id: DRAFT_FRESH_ID,
        status: "draft",
        expiration_date: null,
        created_at: FRESH_ISO,
        updated_at: FRESH_ISO,
        guest_session_id: "s-wedding",
      },
    ],
    orders: [{ id: "o1", wedding_id: DRAFT_PAID_ID, status: "paid", guest_session_id: null }],
    guest_sessions: [
      { id: "s-free", access_token: FREE_TOKEN, expires_at: OLD_ISO },
      { id: "s-draft", access_token: DRAFT_SESSION_TOKEN, expires_at: OLD_ISO },
      { id: "s-wedding", access_token: WEDDING_SESSION_TOKEN, expires_at: OLD_ISO },
    ],
    guest_drafts: [{ id: "g1", session_id: "s-draft", expires_at: LIVE_DRAFT_ISO }],
  };
}

beforeEach(() => {
  seed();
  rpc.mockClear();
  vi.mocked(purgeWedding)
    .mockReset()
    .mockImplementation(async (_admin, weddingId) => ({
      alreadyDeleted: false,
      weddingId,
      slug: `slug-${weddingId}`,
      email: null,
      couple: null,
      previousStatus: null,
      objectsDeleted: 2,
      prefixes: [],
    }));
  vi.mocked(purgeGuestSessionFolders)
    .mockReset()
    .mockResolvedValue({ sessions: 1, objectsDeleted: 3, failures: 0 });
});

describe("runMaintenance", () => {
  it("purges retired invitations and unpaid stale drafts", async () => {
    const result = await runMaintenance();

    const purgedIds = vi.mocked(purgeWedding).mock.calls.map((call) => call[1]);
    expect(purgedIds).toEqual([EXPIRED_ID, CANCELLED_ID, DRAFT_OLD_ID]);
    // A draft with a paid order is a real purchase, not trash.
    expect(purgedIds).not.toContain(DRAFT_PAID_ID);
    expect(purgedIds).not.toContain(DRAFT_FRESH_ID);

    // Only the free session's folder is purged: one has a live draft, the
    // other is still pinned to a draft wedding.
    expect(vi.mocked(purgeGuestSessionFolders)).toHaveBeenCalledWith([FREE_TOKEN]);

    expect(result).toMatchObject({
      expiredInvitations: 1,
      purgedInvitations: 2,
      purgedDraftWeddings: 1,
      purgedSessions: 1,
      purgedObjects: 9,
      purgeFailures: 0,
      degraded: false,
      guestDrafts: 5,
      guestSessions: 4,
    });
    expect(rpc).toHaveBeenCalledWith("mark_expired_invitations");
    expect(rpc).toHaveBeenCalledWith("cleanup_expired_guest_data");
  });

  it("skips the row cleanup when a session folder could not be purged", async () => {
    // Deleting the session rows would erase the only handle on the orphaned
    // files, so the rows must survive for a retry.
    vi.mocked(purgeGuestSessionFolders).mockResolvedValue({
      sessions: 0,
      objectsDeleted: 0,
      failures: 1,
    });

    const result = await runMaintenance();

    expect(rpc).not.toHaveBeenCalledWith("cleanup_expired_guest_data");
    expect(result.purgeFailures).toBe(1);
    expect(result.degraded).toBe(true);
  });

  it("counts a wedding purge failure and keeps going", async () => {
    vi.mocked(purgeWedding).mockRejectedValueOnce(new Error("storage down"));

    const result = await runMaintenance();

    expect(result.purgeFailures).toBe(1);
    expect(result.purgedInvitations).toBe(1);
    expect(result.degraded).toBe(false);
  });

  it("honours the draft retention window override", async () => {
    process.env.DRAFT_WEDDING_RETENTION_DAYS = "0";
    try {
      const result = await runMaintenance();
      const purgedIds = vi.mocked(purgeWedding).mock.calls.map((call) => call[1]);

      expect(purgedIds).toContain(DRAFT_FRESH_ID);
      expect(result.purgedDraftWeddings).toBe(2);
    } finally {
      delete process.env.DRAFT_WEDDING_RETENTION_DAYS;
    }
  });
});
