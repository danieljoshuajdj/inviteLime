import { beforeEach, describe, expect, it, vi } from "vitest";

const WEDDING_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const GUEST_TOKEN = "c".repeat(64);
const DRAFT_FOLDER = "0123456789abcdef-1-1";

interface Row {
  id?: string;
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
      this.db.rows[this.table] = rows.filter(
        (r) => !this.filters.every((f) => r[f.column] === f.value)
      );
      return { data: null, error: null };
    }

    if (this.db.selectError) return { data: null, error: this.db.selectError };
    return { data: this.singleMode ? matched[0] ?? null : matched, error: null };
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
};

vi.mock("@/lib/services/storage", () => ({
  getObjectStorage: vi.fn(async () => storage),
  WEDDING_BUCKET: "weddings",
  ROLE_SALT: { bride: 1, groom: 2, couple: 3, gallery: 4, music: 5, video: 6 },
}));

import { guestFolderDigest } from "./media-access";
import { purgeGuestSessionFolders, purgeWedding, WeddingPurgeError } from "./wedding-purge";

function seedWedding(overrides: Partial<Row> = {}) {
  db.rows.weddings = [
    {
      id: WEDDING_ID,
      slug: "meera-aarav-2027",
      email: "meera@example.com",
      bride_name: "Meera",
      groom_name: "Aarav",
      status: "expired",
      guest_session_id: SESSION_ID,
      wedding_data: null,
      ...overrides,
    },
  ];
  db.rows.guest_sessions = [{ id: SESSION_ID, access_token: GUEST_TOKEN }];
  db.rows.wedding_media = [];
  db.rows.email_deliveries = [
    { id: "e1", wedding_id: WEDDING_ID },
    { id: "e2", wedding_id: "not-this-wedding" },
  ];
  db.rows.analytics_events = [
    { id: "a1", wedding_id: WEDDING_ID },
    { id: "a2", wedding_id: "not-this-wedding" },
  ];
  db.rows.audit_logs = [];
}

beforeEach(() => {
  db.rows = {};
  db.events = [];
  db.selectError = null;
  db.deleteError = null;
  storage.list.mockReset().mockResolvedValue([]);
  storage.delete.mockReset().mockResolvedValue(undefined);
  seedWedding();
});

describe("purgeWedding", () => {
  it("is a no-op for a wedding that is already gone", async () => {
    db.rows.weddings = [];

    const result = await purgeWedding(db as never, WEDDING_ID);

    expect(result.alreadyDeleted).toBe(true);
    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("deletes stored objects, log rows and the row itself, then audits", async () => {
    storage.list.mockImplementation(async (_bucket: string, prefix: string) =>
      prefix === `${WEDDING_ID}/`
        ? [`${WEDDING_ID}/bride/bride-1.webp`, `${WEDDING_ID}/bride/bride-2.webp`]
        : []
    );

    const result = await purgeWedding(db as never, WEDDING_ID, {
      actorId: "admin-1",
      auditAction: "invitation.delete",
    });

    expect(result.alreadyDeleted).toBe(false);
    expect(result.slug).toBe("meera-aarav-2027");
    expect(result.objectsDeleted).toBe(2);
    expect(storage.delete).toHaveBeenCalledTimes(2);

    // Both folder families are enumerated: the wedding uuid folder and the
    // token-derived draft folders of the owning guest session.
    const prefixes = storage.list.mock.calls.map((call) => call[1] as string);
    expect(prefixes).toContain(`${WEDDING_ID}/`);
    expect(prefixes).toContain(`${guestFolderDigest(GUEST_TOKEN)}-`);

    // Logs keyed to the wedding must not survive as anonymous rows.
    expect((db.rows.email_deliveries ?? []).map((r) => r.id)).toEqual(["e2"]);
    expect((db.rows.analytics_events ?? []).map((r) => r.id)).toEqual(["a2"]);
    // Orders/payments keep their rows (wedding_id nulled by the FK).
    expect(db.rows.weddings).toHaveLength(0);

    const audit = db.events.find((e) => e.type === "db:audit_logs:insert");
    expect(audit).toBeTruthy();
    const logged = audit?.detail as { action: string; admin_id: string; target_id: string };
    expect(logged.action).toBe("invitation.delete");
    expect(logged.admin_id).toBe("admin-1");
    expect(logged.target_id).toBe(WEDDING_ID);
  });

  it("purges uploads referenced only by wedding_data", async () => {
    // The owning session can already be gone by purge time, so the blob is the
    // only handle on never-migrated uploads. Library tracks must be excluded.
    seedWedding({
      guest_session_id: null,
      wedding_data: {
        bridePhoto: `/api/media/${DRAFT_FOLDER}/bride/bride-9.webp`,
        gallery: [
          { url: `https://app.example.com/api/media/${DRAFT_FOLDER}/gallery/gallery-9.webp` },
        ],
        music: { url: "/api/media/library/music/shared-track.mp3" },
      },
    });

    const result = await purgeWedding(db as never, WEDDING_ID);

    expect(result.objectsDeleted).toBe(2);
    expect(storage.delete).toHaveBeenCalledWith("weddings", `${DRAFT_FOLDER}/bride/bride-9.webp`);
    expect(storage.delete).toHaveBeenCalledWith("weddings", `${DRAFT_FOLDER}/gallery/gallery-9.webp`);
    expect(storage.delete).not.toHaveBeenCalledWith("weddings", "library/music/shared-track.mp3");
  });

  it("keeps the row when listing stored files fails", async () => {
    storage.list.mockRejectedValue(new Error("B2 unavailable"));

    await expect(purgeWedding(db as never, WEDDING_ID)).rejects.toMatchObject({
      name: "WeddingPurgeError",
      step: "storage-list",
    });
    expect(db.rows.weddings).toHaveLength(1);
    expect(db.events.some((e) => e.type === "db:weddings:delete")).toBe(false);
  });

  it("keeps the row and reports failures when an object cannot be removed", async () => {
    storage.list.mockResolvedValue([`${WEDDING_ID}/gallery/a.webp`]);
    storage.delete.mockRejectedValue(new Error("access denied"));

    let caught: unknown;
    try {
      await purgeWedding(db as never, WEDDING_ID);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(WeddingPurgeError);
    const error = caught as WeddingPurgeError;
    expect(error.step).toBe("storage-delete");
    expect(error.failures).toEqual([
      { key: `${WEDDING_ID}/gallery/a.webp`, detail: "access denied" },
    ]);
    expect(db.rows.weddings).toHaveLength(1);
  });

  it("surfaces a row delete failure after storage cleanup", async () => {
    db.deleteError = { code: "23503", message: "foreign key violation" };
    storage.list.mockResolvedValue([`${WEDDING_ID}/gallery/a.webp`]);

    await expect(purgeWedding(db as never, WEDDING_ID)).rejects.toMatchObject({
      name: "WeddingPurgeError",
      step: "database",
      message: "foreign key violation",
    });
    expect(db.rows.weddings).toHaveLength(1);
  });
});

describe("purgeGuestSessionFolders", () => {
  it("deletes every object under each session's digest prefix", async () => {
    storage.list.mockResolvedValue([`${DRAFT_FOLDER}/gallery/gallery-1.webp`]);

    const result = await purgeGuestSessionFolders([GUEST_TOKEN]);

    expect(result).toEqual({ sessions: 1, objectsDeleted: 1, failures: 0 });
    expect(storage.list).toHaveBeenCalledWith("weddings", `${guestFolderDigest(GUEST_TOKEN)}-`);
    expect(storage.delete).toHaveBeenCalledWith(
      "weddings",
      `${DRAFT_FOLDER}/gallery/gallery-1.webp`
    );
  });

  it("reports a storage failure per session instead of throwing", async () => {
    storage.list.mockRejectedValue(new Error("boom"));

    const result = await purgeGuestSessionFolders([GUEST_TOKEN]);

    expect(result).toEqual({ sessions: 0, objectsDeleted: 0, failures: 1 });
  });

  it("ignores missing tokens", async () => {
    const result = await purgeGuestSessionFolders([null, undefined]);

    expect(result).toEqual({ sessions: 0, objectsDeleted: 0, failures: 0 });
    expect(storage.list).not.toHaveBeenCalled();
  });
});
