import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WEDDING_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const GUEST_TOKEN = "c".repeat(64);

interface Row {
  id: string;
  [key: string]: unknown;
}

interface Result {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private deleting = false;
  private singleMode = false;
  private forcedError: { code?: string; message?: string } | null = null;

  constructor(
    private readonly table: string,
    private readonly db: FakeDb
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }
  maybeSingle() {
    this.singleMode = true;
    return this.resolve();
  }
  single() {
    this.singleMode = true;
    return this.resolve();
  }
  delete() {
    this.deleting = true;
    return this;
  }
  isDeleting() {
    return this.deleting;
  }
  insert(values: Record<string, unknown>) {
    this.db.events.push({ type: `db:${this.table}:insert`, detail: values });
    return Promise.resolve({ data: null, error: null });
  }
  then<TResult>(onfulfilled?: (v: Result) => TResult | PromiseLike<TResult>): Promise<TResult> {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private resolve(): Result {
    const rows = this.db.rows[this.table] ?? [];
    const matched = rows.filter((r) => this.filters.every((f) => r[f.column] === f.value));

    if (this.deleting) {
      this.db.events.push({ type: `db:${this.table}:delete`, detail: this.filters });
      if (this.db.deleteError) return { data: null, error: this.db.deleteError };
      this.db.rows[this.table] = rows.filter((r) => !this.filters.every((f) => r[f.column] === f.value));
      return { data: null, error: null };
    }

    const error = this.db.selectError;
    if (error) return { data: null, error };
    return { data: this.singleMode ? (matched[0] ?? null) : matched, error: null };
  }
}

interface FakeDb {
  rows: Record<string, Row[]>;
  events: Array<{ type: string; detail: unknown }>;
  selectError: { message: string } | null;
  deleteError: { code: string; message: string } | null;
  from(table: string): FakeQuery;
}

const db: FakeDb = {
  rows: {},
  events: [],
  selectError: null,
  deleteError: null,
  from(table: string) {
    return new FakeQuery(table, db);
  },
};

const storage = {
  list: vi.fn(),
  delete: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  exists: vi.fn(),
  move: vi.fn(),
  copy: vi.fn(),
  signedUrl: vi.fn(),
  publicUrl: vi.fn(),
};

const consumeRateLimit = vi.fn(async () => ({ allowed: true }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: ADMIN_ID } }, error: null }) },
    from: db.from,
  }),
}));
vi.mock("@/lib/services/ops", () => ({
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...(a as [])),
}));
vi.mock("@/lib/services/storage", () => ({
  getObjectStorage: vi.fn(async () => storage),
  WEDDING_BUCKET: "weddings",
}));

beforeEach(() => {
  db.rows = {};
  db.events = [];
  db.selectError = null;
  db.deleteError = null;
  storage.list.mockReset().mockResolvedValue([]);
  storage.delete.mockReset().mockResolvedValue(undefined);
  consumeRateLimit.mockClear();
  consumeRateLimit.mockResolvedValue({ allowed: true });
  seedProfiles("admin");
  seedWedding();
});

function seedProfiles(role = "admin") {
  db.rows.profiles = [{ id: ADMIN_ID, role, status: "active" }];
}

function seedWedding(overrides: Partial<Row> = {}) {
  db.rows.weddings = [
    {
      id: WEDDING_ID,
      slug: "meera-aarav-2027",
      email: "meera@example.com",
      bride_name: "Meera",
      groom_name: "Aarav",
      status: "active",
      guest_session_id: SESSION_ID,
      ...overrides,
    },
  ];
  db.rows.guest_sessions = [{ id: SESSION_ID, access_token: GUEST_TOKEN }];
  db.rows.wedding_media = [];
}

async function runDelete(id = WEDDING_ID, body: Record<string, unknown> = {}) {
  const { DELETE } = await import("./route");
  return DELETE(
    new Request(`http://localhost/api/admin/invitations/${id}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe("DELETE /api/admin/invitations/[id]", () => {
  it("rejects a non-admin with 403", async () => {
    seedProfiles("customer");
    const res = await runDelete();
    expect(res.status).toBe(403);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("rejects a malformed id with 400", async () => {
    const res = await runDelete("not-a-uuid");
    expect(res.status).toBe(400);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("rate limits destructive calls", async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false });
    const res = await runDelete();
    expect(res.status).toBe(429);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("is idempotent when the wedding is already gone", async () => {
    db.rows.weddings = [];
    const res = await runDelete();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyDeleted: boolean };
    expect(body.alreadyDeleted).toBe(true);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("deletes stored objects before deleting the row", async () => {
    // The ordering is the safety property: if storage fails we must not have
    // already removed the row, otherwise a retry cannot finish the cleanup.
    storage.list.mockResolvedValue([`${WEDDING_ID}/gallery/a.webp`]);
    const order: string[] = [];
    storage.delete.mockImplementation(async () => {
      order.push("storage");
    });
    const originalFrom = db.from.bind(db);
    db.from = (table: string) => {
      const q = originalFrom(table);
      const origThen = q.then.bind(q);
      q.then = ((f?: (v: Result) => unknown) =>
        origThen((v: Result) => {
          if (table === "weddings" && q.isDeleting()) order.push("row");
          return (f as (x: Result) => unknown)(v);
        })) as typeof q.then;
      return q;
    };

    const res = await runDelete();
    db.from = originalFrom;

    expect(res.status).toBe(200);
    expect(order[0]).toBe("storage");
    expect(order).toContain("row");
    expect(order.indexOf("storage")).toBeLessThan(order.indexOf("row"));
  });

  it("deletes every listed object and the row on success", async () => {
    storage.list.mockResolvedValue([
      `${WEDDING_ID}/bride/bride-1.webp`,
      `${WEDDING_ID}/gallery/gallery-2.webp`,
    ]);
    const res = await runDelete();
    const body = (await res.json()) as { objectsDeleted: number; slug: string };

    expect(res.status).toBe(200);
    expect(body.objectsDeleted).toBe(2);
    expect(body.slug).toBe("meera-aarav-2027");
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(db.rows.weddings).toHaveLength(0);
  });

  it("also purges unmigrated draft uploads for the guest session", async () => {
    // Draft media lives in a token-derived folder, not the wedding uuid folder.
    storage.list.mockResolvedValue([]);
    await runDelete();

    const prefixes = storage.list.mock.calls.map((c) => c[1] as string);
    expect(prefixes).toContain(`${WEDDING_ID}/`);
    expect(prefixes.some((p) => /^[0-9a-f]{16}-$/.test(p))).toBe(true);
  });

  it("aborts before deleting the row when listing fails", async () => {
    storage.list.mockRejectedValue(new Error("B2 unavailable"));
    const res = await runDelete();
    expect(res.status).toBe(500);
    expect(db.rows.weddings).toHaveLength(1);
    expect(db.events.some((e) => e.type === "db:weddings:delete")).toBe(false);
  });

  it("aborts before deleting the row when an object cannot be removed", async () => {
    storage.list.mockResolvedValue([`${WEDDING_ID}/gallery/a.webp`]);
    storage.delete.mockRejectedValue(new Error("access denied"));
    const res = await runDelete();
    const body = (await res.json()) as { step: string };

    expect(res.status).toBe(500);
    expect(body.step).toBe("storage-delete");
    expect(db.rows.weddings).toHaveLength(1);
    expect(db.events.some((e) => e.type === "db:weddings:delete")).toBe(false);
  });

  it("still deletes recorded keys that sit outside the enumerated prefixes", async () => {
    storage.list.mockResolvedValue([]);
    db.rows.wedding_media = [
      { id: "m1", wedding_id: WEDDING_ID, storage_key: "99999999-8888-7777-6666-555555555555/music/m-1.webp" },
    ];
    const res = await runDelete();
    const body = (await res.json()) as { objectsDeleted: number };

    expect(res.status).toBe(200);
    expect(body.objectsDeleted).toBe(1);
    expect(storage.delete).toHaveBeenCalledWith("weddings", "99999999-8888-7777-6666-555555555555/music/m-1.webp");
  });

  it("reports a row delete failure without claiming success", async () => {
    db.deleteError = { code: "23503", message: "foreign key violation" };
    const res = await runDelete();
    expect(res.status).toBe(500);
  });
});