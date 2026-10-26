import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "99999999-9999-4999-8999-999999999999";
const TARGET_EMAIL = "customer@example.com";
const WEDDING_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const GUEST_TOKEN = "c".repeat(64);
const DRAFT_FOLDER = "0123456789abcdef-1-1";

interface Row {
  id: string;
  [key: string]: unknown;
}

interface Result {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

class FakeQuery {
  private filters: Array<{ column: string; kind: "eq" | "in"; value: unknown }> = [];
  private deleting = false;
  private singleMode = false;

  constructor(
    private readonly table: string,
    private readonly db: FakeDb
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, kind: "eq", value });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ column, kind: "in", value: values });
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
  insert(values: Record<string, unknown>) {
    this.db.events.push({ type: `db:${this.table}:insert`, detail: values });
    const rows = this.db.rows[this.table] ?? [];
    this.db.rows[this.table] = [...rows, { id: `generated-${rows.length + 1}`, ...values }];
    return Promise.resolve({ data: null, error: null });
  }
  then<TResult>(onfulfilled?: (v: Result) => TResult | PromiseLike<TResult>): Promise<TResult> {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) =>
      f.kind === "eq" ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column])
    );
  }

  private resolve(): Result {
    const rows = this.db.rows[this.table] ?? [];

    if (this.deleting) {
      this.db.events.push({ type: `db:${this.table}:delete`, detail: this.filters });
      if (this.db.deleteError) return { data: null, error: this.db.deleteError };
      this.db.rows[this.table] = rows.filter((r) => !this.matches(r));
      return { data: null, error: null };
    }

    if (this.db.selectError) return { data: null, error: this.db.selectError };
    const matched = rows.filter((r) => this.matches(r));
    return { data: this.singleMode ? (matched[0] ?? null) : matched, error: null };
  }
}

interface FakeDb {
  rows: Record<string, Row[]>;
  events: Array<{ type: string; detail?: unknown }>;
  selectError: { message: string } | null;
  deleteError: { code?: string; message: string } | null;
  auth: {
    admin: {
      getUserById: ReturnType<typeof vi.fn>;
      deleteUser: ReturnType<typeof vi.fn>;
    };
  };
  from(table: string): FakeQuery;
}

const db: FakeDb = {
  rows: {},
  events: [],
  selectError: null,
  deleteError: null,
  auth: {
    admin: {
      getUserById: vi.fn(),
      deleteUser: vi.fn(),
    },
  },
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

function seed() {
  db.rows.profiles = [
    { id: ADMIN_ID, role: "admin", status: "active" },
    { id: TARGET_ID, role: "customer", status: "active" },
  ];
  db.rows.weddings = [
    {
      id: WEDDING_ID,
      user_id: TARGET_ID,
      slug: "kabir-aya-2027",
      email: TARGET_EMAIL,
      bride_name: "Aya",
      groom_name: "Kabir",
      status: "active",
      guest_session_id: SESSION_ID,
    },
  ];
  db.rows.guest_sessions = [{ id: SESSION_ID, access_token: GUEST_TOKEN }];
  db.rows.wedding_media = [
    { id: "m1", wedding_id: WEDDING_ID, storage_key: `${WEDDING_ID}/gallery/a.webp` },
  ];
  db.rows.orders = [
    { id: "o1", user_id: TARGET_ID, wedding_id: null },
    { id: "o2", user_id: null, wedding_id: WEDDING_ID },
  ];
  db.rows.email_deliveries = [
    { id: "e1", user_id: TARGET_ID, wedding_id: null },
    { id: "e2", user_id: null, wedding_id: WEDDING_ID },
  ];
  db.rows.analytics_events = [
    { id: "a1", user_id: TARGET_ID, wedding_id: null },
    { id: "a2", user_id: null, wedding_id: WEDDING_ID },
  ];
  db.rows.audit_logs = [
    { id: "l1", admin_id: ADMIN_ID, action: "user.role_change", target_type: "user", target_id: TARGET_ID },
    { id: "l2", admin_id: TARGET_ID, action: "template.create", target_type: "template", target_id: null },
  ];
}

beforeEach(() => {
  db.rows = {};
  db.events = [];
  db.selectError = null;
  db.deleteError = null;
  db.auth.admin.getUserById.mockReset().mockResolvedValue({
    data: { user: { id: TARGET_ID, email: TARGET_EMAIL } },
    error: null,
  });
  db.auth.admin.deleteUser.mockReset().mockImplementation(async () => {
    db.events.push({ type: "auth:user:delete" });
    return { data: {}, error: null };
  });
  storage.list.mockReset().mockResolvedValue([]);
  storage.delete.mockReset().mockImplementation(async () => {
    db.events.push({ type: "storage:delete" });
  });
  consumeRateLimit.mockClear().mockResolvedValue({ allowed: true });
  seed();
});

async function runDelete(id = TARGET_ID, body: Record<string, unknown> = {}) {
  const { DELETE } = await import("./route");
  return DELETE(
    new Request(`http://localhost/api/admin/users/${id}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

const correct = { confirm: TARGET_EMAIL };

function dbDeleteEvents() {
  return db.events.filter((e) => e.type.startsWith("db:") && e.type.endsWith(":delete"));
}

describe("DELETE /api/admin/users/[id]", () => {
  it("rejects a non-admin with 403", async () => {
    db.rows.profiles = [{ id: ADMIN_ID, role: "customer", status: "active" }];
    const res = await runDelete(TARGET_ID, correct);
    expect(res.status).toBe(403);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed id with 400", async () => {
    const res = await runDelete("not-a-uuid", correct);
    expect(res.status).toBe(400);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses to delete the acting admin's own account", async () => {
    const res = await runDelete(ADMIN_ID, { confirm: "admin@example.com" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/own account/i);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("rate limits destructive calls", async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false });
    const res = await runDelete(TARGET_ID, correct);
    expect(res.status).toBe(429);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("requires the confirmation to match the account email", async () => {
    const wrong = await runDelete(TARGET_ID, { confirm: "someone-else@example.com" });
    expect(wrong.status).toBe(400);
    const missing = await runDelete(TARGET_ID, {});
    expect(missing.status).toBe(400);
    expect(dbDeleteEvents()).toHaveLength(0);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("is idempotent when the account is already gone", async () => {
    db.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: { message: "User not found" } });
    const res = await runDelete(TARGET_ID, correct);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyDeleted: boolean };
    expect(body.alreadyDeleted).toBe(true);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    // Audit rows referencing the deleted id are plain text and survive an
    // auth-level delete, so the already-gone path still purges them.
    expect(db.rows.audit_logs.some((r) => r.target_id === TARGET_ID)).toBe(false);
  });

  it("deletes storage first, then rows, then the auth account", async () => {
    storage.list.mockResolvedValue([`${WEDDING_ID}/gallery/a.webp`]);
    const res = await runDelete(TARGET_ID, correct);
    const body = (await res.json()) as { ok: boolean; weddingsDeleted: number; objectsDeleted: number };

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, weddingsDeleted: 1, objectsDeleted: 1 });

    const order = db.events.map((e) => e.type);
    const storageAt = order.indexOf("storage:delete");
    const weddingAt = order.indexOf("db:weddings:delete");
    const authAt = order.indexOf("auth:user:delete");
    expect(storageAt).toBeGreaterThanOrEqual(0);
    expect(weddingAt).toBeGreaterThan(storageAt);
    expect(authAt).toBeGreaterThan(weddingAt);
  });

  it("erases every user-owned row on success", async () => {
    storage.list.mockResolvedValue([`${WEDDING_ID}/gallery/a.webp`]);
    const res = await runDelete(TARGET_ID, correct);

    expect(res.status).toBe(200);
    expect(db.rows.weddings).toHaveLength(0);
    expect(db.rows.orders).toHaveLength(0);
    expect(db.rows.email_deliveries).toHaveLength(0);
    expect(db.rows.analytics_events).toHaveLength(0);
    expect(db.auth.admin.deleteUser).toHaveBeenCalledWith(TARGET_ID);

    // The purge runs before the new audit record, so exactly the record of
    // this deletion remains — with counts only, never account details.
    expect(db.rows.audit_logs).toHaveLength(1);
    expect(db.rows.audit_logs[0].action).toBe("user.delete");
    expect(db.rows.audit_logs[0].target_id).toBe(TARGET_ID);
    expect(db.rows.audit_logs[0].metadata).toEqual({ weddings: 1, objectsDeleted: 1 });
  });

  it("also purges uploads referenced only by wedding_data", async () => {
    // Un-migrated draft uploads are referenced only by the builder blob; the
    // account deletion must not leave them orphaned in the bucket.
    db.rows.weddings[0].wedding_data = {
      bridePhoto: `/api/media/${DRAFT_FOLDER}/bride/bride-9.webp`,
    };
    storage.list.mockResolvedValue([]);

    const res = await runDelete(TARGET_ID, correct);
    const body = (await res.json()) as { objectsDeleted: number };

    expect(res.status).toBe(200);
    expect(body.objectsDeleted).toBe(1);
    expect(storage.delete).toHaveBeenCalledWith("weddings", `${DRAFT_FOLDER}/bride/bride-9.webp`);
  });

  it("aborts before touching any row when listing stored files fails", async () => {
    storage.list.mockRejectedValue(new Error("B2 unavailable"));
    const res = await runDelete(TARGET_ID, correct);
    const body = (await res.json()) as { step: string };

    expect(res.status).toBe(500);
    expect(body.step).toBe("storage-list");
    expect(dbDeleteEvents()).toHaveLength(0);
    expect(db.rows.weddings).toHaveLength(1);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("aborts before touching any row when a stored file cannot be removed", async () => {
    storage.list.mockResolvedValue([`${WEDDING_ID}/gallery/a.webp`]);
    storage.delete.mockRejectedValue(new Error("access denied"));
    const res = await runDelete(TARGET_ID, correct);
    const body = (await res.json()) as { step: string };

    expect(res.status).toBe(500);
    expect(body.step).toBe("storage-delete");
    expect(dbDeleteEvents()).toHaveLength(0);
    expect(db.rows.orders).toHaveLength(2);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("reports a row failure without removing the account", async () => {
    db.deleteError = { code: "23503", message: "foreign key violation" };
    const res = await runDelete(TARGET_ID, correct);
    const body = (await res.json()) as { step: string };

    expect(res.status).toBe(500);
    expect(body.step).toBe("rows");
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(db.rows.weddings).toHaveLength(1);
  });

  it("reports failure when the account itself cannot be removed", async () => {
    db.auth.admin.deleteUser.mockResolvedValue({ data: {}, error: { message: "boom" } });
    const res = await runDelete(TARGET_ID, correct);
    const body = (await res.json()) as { step: string };

    expect(res.status).toBe(500);
    expect(body.step).toBe("auth-user");
    // No success audit record for an operation that did not complete.
    expect(db.rows.audit_logs).toHaveLength(0);
  });
});
