import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeddingTemplateRef } from "@/lib/services/template-lifecycle";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_TPL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VER2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const VER_OTHER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const W_ACTIVE = "11111111-1111-4111-8111-111111111111";
const W_DRAFT = "22222222-2222-4222-8222-222222222222";
const W_EXPIRED = "33333333-3333-4333-8333-333333333333";
const W_OTHER = "44444444-4444-4444-8444-444444444444";
const PACK = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const DETAIL_PACK = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const MUSIC = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PRODUCT = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";

interface Row {
  id: string;
  [key: string]: unknown;
}

interface Filter {
  type: "eq" | "in" | "or";
  column?: string;
  value: unknown;
}

function matches(row: Row, filters: Filter[]): boolean {
  for (const f of filters) {
    if (f.type === "eq") {
      if (row[f.column as string] !== f.value) return false;
    } else if (f.type === "in") {
      const values = f.value as unknown[];
      if (values.length === 0 || !values.includes(row[f.column as string])) return false;
    } else if (f.type === "or") {
      const parts = String(f.value).split(",");
      const ok = parts.some((part) => {
        const m = part.match(/^(\w+)\.(eq|in)\.(.+)$/);
        if (!m) return false;
        const [, col, verb, raw] = m;
        if (verb === "eq") return row[col] === raw;
        const list = raw.replace(/^\(|\)$/g, "").split(",");
        return list.includes(row[col] as string);
      });
      if (!ok) return false;
    }
  }
  return true;
}

class FakeQuery {
  private filters: Filter[] = [];
  private pending: { type: "update" | "delete"; values?: Record<string, unknown> } | null = null;
  private singleMode = false;
  private returnDeleted = false;

  constructor(private readonly table: string) {}

  select() {
    if (this.pending?.type === "delete") this.returnDeleted = true;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.pending = { type: "update", values };
    return this;
  }
  delete() {
    this.pending = { type: "delete" };
    return this;
  }
  insert(values: Record<string, unknown>) {
    db.writes.push({ table: this.table, kind: "insert", values, filters: [] });
    return Promise.resolve({ data: null, error: null });
  }
  eq(column: string, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }
  in(column: string, value: unknown) {
    this.filters.push({ type: "in", column, value });
    return this;
  }
  or(value: string) {
    this.filters.push({ type: "or", value });
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
  then<TResult>(onfulfilled?: (v: Result) => TResult | PromiseLike<TResult>): Promise<TResult> {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private resolve(): Result {
    const rows = db.rows[this.table] ?? [];
    const matched = rows.filter((r) => matches(r, this.filters));

    if (this.pending?.type === "delete") {
      const deletedRows = this.returnDeleted ? matched.map((r) => ({ ...r })) : [];
      db.rows[this.table] = rows.filter((r) => !matches(r, this.filters));
      db.writes.push({ table: this.table, kind: "delete", filters: this.filters.slice() });
      return { data: deletedRows, error: null };
    }

    if (this.pending?.type === "update") {
      const values = this.pending.values!;
      db.writes.push({ table: this.table, kind: "update", values, filters: this.filters.slice() });
      db.rows[this.table] = rows.map((r) => (matches(r, this.filters) ? { ...r, ...values } : r));
      const affected = matched[0] ? { ...matched[0], ...values } : null;
      return { data: this.singleMode ? affected : affected ? [affected] : [], error: null };
    }

    if (this.singleMode) return { data: matched[0] ?? null, error: null };
    return { data: matched, error: null };
  }
}

interface Result {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/** Templates delete that surfaces an FK violation (23503), as Postgres would. */
class FailingTemplateDelete extends FakeQuery {
  private failing = false;
  delete() {
    this.failing = true;
    return super.delete();
  }
  then<TResult>(onfulfilled?: (v: Result) => TResult | PromiseLike<TResult>): Promise<TResult> {
    if (this.failing) {
      return Promise.resolve({
        data: null,
        error: { code: "23503", message: 'insert or update on table "weddings" violates foreign key constraint' },
      }).then(onfulfilled as never);
    }
    return super.then(onfulfilled as never);
  }
}

const db = {
  rows: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; kind: string; values?: Record<string, unknown>; filters: Filter[] }>,
  from(table: string) {
    return new FakeQuery(table);
  },
};

const storage = {
  keys: [] as string[],
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
    auth: {
      getUser: async () => ({ data: { user: { id: ADMIN_ID } }, error: null }),
    },
    from: db.from,
  }),
}));
vi.mock("@/lib/services/ops", () => ({
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...(a as [])),
}));
vi.mock("@/lib/services/storage", () => ({
  getObjectStorage: vi.fn(async () => storage),
  TEMPLATE_BUCKET: "templates",
  WEDDING_BUCKET: "weddings",
  MAX_IMAGE_BYTES: 15 * 1024 * 1024,
  MAX_AUDIO_BYTES: 10 * 1024 * 1024,
  MAX_VIDEO_BYTES: 60 * 1024 * 1024,
}));

beforeEach(() => {
  db.rows = {};
  db.writes = [];
  db.from = (table: string) => new FakeQuery(table);
  storage.keys = [];
  storage.list.mockReset().mockResolvedValue([]);
  storage.delete.mockReset().mockResolvedValue(undefined);
});

async function runDelete(id: string) {
  const { DELETE } = await import("./route");
  return DELETE(new Request(`http://localhost/api/admin/templates/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

function seedTemplate(id: string, name = "Test Template") {
  db.rows.templates = [{ id, name, slug: "test-template", status: "active" }];
  db.rows.template_versions = [
    { id: VER, template_id: id, version: "1.0.0" },
    { id: VER2, template_id: id, version: "2.0.0" },
  ];
}

function seedProfiles(role = "admin") {
  db.rows.profiles = [{ id: ADMIN_ID, role, status: "active" }];
}

function seedWeddings(list: Array<Partial<WeddingTemplateRef>>) {
  db.rows.weddings = list.map((w, i) => ({
    id: `seed-${i}`,
    template_id: null,
    template_version_id: null,
    status: "active",
    expiration_date: "2999-01-01",
    ...w,
  }));
}

function seedDemoResources() {
  db.rows.media_packs = [{ id: PACK, name: "Demo pack" }];
  db.rows.media_pack_items = [
    { id: "pack-item-1", pack_id: PACK, storage_key: "library/media/photo-1.webp" },
    { id: "pack-item-2", pack_id: PACK, storage_key: "library/media/photo-2.webp" },
  ];
  db.rows.demo_detail_packs = [{ id: DETAIL_PACK, name: "Demo details" }];
  db.rows.demo_detail_pack_events = [
    { id: "detail-event-1", pack_id: DETAIL_PACK, name: "Ceremony" },
  ];
  db.rows.music_tracks = [{ id: MUSIC, storage_key: "library/music/track-1.mp3" }];
  db.rows.products = [{ id: PRODUCT, name: "Template pricing" }];
  db.rows.orders = [];
  db.rows.guest_drafts = [];
}

function assignDemoResources(templateId: string) {
  const row = db.rows.templates.find((t) => t.id === templateId);
  if (!row) throw new Error("seed template first");
  Object.assign(row, {
    thumbnail_path: `${templateId}/thumbnail`,
    media_pack_id: PACK,
    demo_detail_pack_id: DETAIL_PACK,
    music_track_id: MUSIC,
    product_id: PRODUCT,
  });
}

describe("DELETE /api/admin/templates/[id]", () => {
  it("rejects a non-admin with 403", async () => {
    seedProfiles("customer");
    const res = await runDelete(TPL);
    expect(res.status).toBe(403);
    expect(db.writes.filter((w) => w.kind === "delete")).toHaveLength(0);
  });

  it("rejects a malformed id with 400", async () => {
    seedProfiles();
    const res = await runDelete("not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("blocks while the template powers an active invitation (409 with server-side counts)", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedWeddings([
      { id: W_ACTIVE, template_id: TPL, status: "active", expiration_date: "2999-01-01" },
      { id: W_DRAFT, template_id: TPL, status: "draft" },
    ]);
    const res = await runDelete(TPL);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("TEMPLATE_IN_USE");
    expect(body.activeInvitations).toBe(1);
    expect(body.totalInvitations).toBe(2);
    // No mutations on a block.
    expect(db.writes.filter((w) => w.kind === "delete" || w.kind === "update")).toHaveLength(0);
    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(db.rows.templates).toHaveLength(1);
  });

  it("counts an active wedding that references only a version id", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedWeddings([
      { id: W_ACTIVE, template_id: TPL, template_version_id: VER, status: "active", expiration_date: "2999-01-01" },
    ]);
    db.rows.weddings[0].template_id = null;
    const res = await runDelete(TPL);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.activeInvitations).toBe(1);
  });

  it("detaches non-active invitations, deletes drafts, and removes package objects on success", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedWeddings([
      { id: W_DRAFT, template_id: TPL, status: "draft" },
      { id: W_EXPIRED, template_id: TPL, template_version_id: VER, status: "active", expiration_date: "2000-01-01" },
    ]);
    db.rows.weddings.push({
      id: W_OTHER,
      template_id: OTHER_TPL,
      template_version_id: VER_OTHER,
      status: "active",
      expiration_date: "2999-01-01",
    } as Row);
    db.rows.guest_drafts = [
      { id: "draft-1", template_id: TPL, template_version_id: VER },
      { id: "draft-2", template_id: OTHER_TPL, template_version_id: VER_OTHER },
    ];
    storage.keys = [
      `${TPL}/v1.0.0/index.html`,
      `${TPL}/v1.0.0/manifest.json`,
      `${TPL}/thumbnail`,
      `${OTHER_TPL}/v1.0.0/index.html`,
    ];
    storage.list.mockImplementation(async (_bucket: string, prefix: string) =>
      storage.keys.filter((k) => k.startsWith(prefix))
    );
    storage.delete.mockImplementation(async (_bucket: string, key: string) => {
      storage.keys = storage.keys.filter((k) => k !== key);
    });

    const res = await runDelete(TPL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.versionsDeleted).toBe(2);
    expect(body.objectsDeleted).toBe(3);
    expect(body.detachedWeddings).toBe(2);
    expect(body.deletedDrafts).toBe(1);

    // Detach applied to the two non-active weddings only.
    const detach = db.writes.find((w) => w.kind === "update" && w.table === "weddings");
    expect(detach?.values).toEqual({ template_id: null, template_version_id: null });
    const detachedIds = detach?.filters.find((f) => f.type === "in")?.value as unknown[];
    expect(detachedIds).toEqual(expect.arrayContaining([W_DRAFT, W_EXPIRED]));
    expect(detachedIds).not.toContain(W_OTHER);
    // The unrelated wedding is untouched in the row store.
    expect(db.rows.weddings.find((w) => w.id === W_OTHER)?.template_id).toBe(OTHER_TPL);

    // Only this template's drafts were deleted.
    const draftNs = db.writes.find((w) => w.kind === "delete" && w.table === "guest_drafts");
    expect(draftNs?.filters[0]?.type).toBe("or");
    expect(db.rows.guest_drafts.map((d) => d.id)).toEqual(["draft-2"]);

    // Storage: listed under this template's prefix and only its keys deleted.
    expect(storage.list).toHaveBeenCalledWith("templates", `${TPL}/`);
    const deletedKeys = storage.delete.mock.calls.map((c) => c[1]);
    expect(deletedKeys).toEqual(
      expect.arrayContaining([`${TPL}/v1.0.0/index.html`, `${TPL}/v1.0.0/manifest.json`, `${TPL}/thumbnail`])
    );
    expect(deletedKeys).not.toContain(`${OTHER_TPL}/v1.0.0/index.html`);

    // Template row removed; orders/payments never touched.
    expect(db.rows.templates).toHaveLength(0);
    expect(db.writes.find((w) => w.table === "orders")).toBeUndefined();
    expect(db.writes.find((w) => w.table === "payments")).toBeUndefined();
  });

  it("removes demo photos, details, soundtrack and an unlinked product along with the template", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedDemoResources();
    assignDemoResources(TPL);
    seedWeddings([]);
    storage.list.mockImplementation(async (_bucket: string, prefix: string) =>
      `${TPL}/`.startsWith(prefix) ? [`${TPL}/thumbnail`, `${TPL}/v1.0.0/index.html`] : []
    );

    const res = await runDelete(TPL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.removedMediaPacks).toBe(1);
    expect(body.removedDetailPacks).toBe(1);
    expect(body.removedMusicTracks).toBe(1);
    expect(body.removedProducts).toBe(1);
    expect(body.objectsDeleted).toBe(5);

    // Rows are gone.
    expect(db.rows.media_packs).toHaveLength(0);
    expect(db.rows.media_pack_items).toHaveLength(0);
    expect(db.rows.demo_detail_packs).toHaveLength(0);
    expect(db.rows.demo_detail_pack_events).toHaveLength(0);
    expect(db.rows.music_tracks).toHaveLength(0);
    expect(db.rows.products).toHaveLength(0);

    // Both private-bucket objects were deleted before their rows.
    expect(storage.delete).toHaveBeenCalledWith("weddings", "library/media/photo-1.webp");
    expect(storage.delete).toHaveBeenCalledWith("weddings", "library/media/photo-2.webp");
    expect(storage.delete).toHaveBeenCalledWith("weddings", "library/music/track-1.mp3");
  });

  it("keeps demo assets that another template still uses", async () => {
    seedProfiles();
    seedTemplate(TPL);
    db.rows.templates.push({
      id: OTHER_TPL,
      name: "Other template",
      slug: "other-template",
      media_pack_id: PACK,
      demo_detail_pack_id: DETAIL_PACK,
      music_track_id: MUSIC,
      product_id: PRODUCT,
    });
    seedDemoResources();
    assignDemoResources(TPL);
    db.rows.guest_drafts = [];
    seedWeddings([]);

    const res = await runDelete(TPL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removedMediaPacks).toBe(0);
    expect(body.removedDetailPacks).toBe(0);
    expect(body.removedMusicTracks).toBe(0);
    expect(body.removedProducts).toBe(0);

    expect(db.rows.media_packs).toHaveLength(1);
    expect(db.rows.media_pack_items).toHaveLength(2);
    expect(db.rows.demo_detail_packs).toHaveLength(1);
    expect(db.rows.demo_detail_pack_events).toHaveLength(1);
    expect(db.rows.music_tracks).toHaveLength(1);
    expect(db.rows.products).toHaveLength(1);
    expect(storage.delete.mock.calls.filter((c) => c[0] === "weddings")).toHaveLength(0);
  });

  it("keeps the template row when demo photo deletion fails, so a retry can finish", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedDemoResources();
    assignDemoResources(TPL);
    seedWeddings([]);
    storage.list.mockResolvedValue([]);
    storage.delete.mockImplementation(async (bucket: string) => {
      if (bucket === "weddings") throw new Error("backblaze unavailable");
    });

    const res = await runDelete(TPL);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.step).toBe("media_pack");
    expect(db.rows.templates).toHaveLength(1);
    expect(db.rows.media_packs).toHaveLength(1);
    expect(db.rows.media_pack_items).toHaveLength(2);
  });

  it("keeps a product that already backs an order", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedDemoResources();
    assignDemoResources(TPL);
    db.rows.orders = [{ id: "order-1", product_id: PRODUCT, status: "paid" }];
    seedWeddings([]);

    const res = await runDelete(TPL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removedProducts).toBe(0);
    expect(db.rows.products).toHaveLength(1);
    expect(db.rows.orders).toHaveLength(1);
  });

  it("also clears legacy version prefixes and thumbnail/preview keys outside the template folder", async () => {
    seedProfiles();
    seedTemplate(TPL);
    db.rows.template_versions = [
      { id: VER, template_id: TPL, version: "1.0.0", storage_prefix: "legacy/first" },
      { id: VER2, template_id: TPL, version: "2.0.0", storage_prefix: `${TPL}/v2.0.0` },
    ];
    db.rows.templates[0].thumbnail_path = "shared/thumbnail.webp";
    db.rows.templates[0].preview_gif_path = `${TPL}/preview.gif`;
    db.rows.guest_drafts = [];
    seedWeddings([]);
    storage.list.mockImplementation(async (_bucket: string, prefix: string) => {
      if (prefix === "legacy/first/") return ["legacy/first/index.html"];
      if (prefix === `${TPL}/`) return [`${TPL}/preview.gif`, `${TPL}/v2.0.0/index.html`];
      return [];
    });

    const res = await runDelete(TPL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectsDeleted).toBe(4);

    expect(storage.list).toHaveBeenCalledWith("templates", "legacy/first/");
    expect(storage.list).toHaveBeenCalledWith("templates", `${TPL}/`);
    const deleted = storage.delete.mock.calls.map((c) => c[1]);
    expect(deleted).toEqual(
      expect.arrayContaining([
        "shared/thumbnail.webp",
        "legacy/first/index.html",
        `${TPL}/preview.gif`,
        `${TPL}/v2.0.0/index.html`,
      ])
    );
  });

  it("treats deleting an already-deleted template as a safe no-op (idempotent retry)", async () => {
    seedProfiles();
    db.rows.templates = [];
    const res = await runDelete(TPL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyDeleted).toBe(true);
    expect(storage.list).not.toHaveBeenCalled();
  });

  it("treats expired invitations as non-blocking so they can be detached", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedWeddings([{ id: W_EXPIRED, template_id: TPL, status: "active", expiration_date: "2000-01-01" }]);
    const res = await runDelete(TPL);
    expect(res.status).toBe(200);
    expect(db.rows.weddings[0].template_id).toBeNull();
    expect(db.rows.weddings[0].template_version_id).toBeNull();
  });

  it("detects a concurrent re-attachment (FK violation) and re-checks with a 409", async () => {
    seedProfiles();
    seedTemplate(TPL);
    // Nothing active at check time, so the guard passes...
    seedWeddings([]);
    db.rows.guest_drafts = [];

    let templateSelects = 0;
    const baseFrom = db.from.bind(db);
    db.from = vi.fn((table: string) => {
      if (table === "templates") {
        templateSelects += 1;
        if (templateSelects > 1) {
          // ...but a wedding lands between check and delete, and the row delete
          // fails with the FK violation it would cause in Postgres.
          db.rows.weddings.push({
            id: W_ACTIVE,
            template_id: TPL,
            template_version_id: VER,
            status: "active",
            expiration_date: "2999-01-01",
          } as Row);
          return new FailingTemplateDelete(table);
        }
      }
      return baseFrom(table);
    });

    const res = await runDelete(TPL);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("TEMPLATE_IN_USE");
    expect(body.activeInvitations).toBe(1);
    // The template row survives the race.
    expect(db.rows.templates).toHaveLength(1);
  });

  it("returns a structured error and leaves the template intact if storage cleanup fails", async () => {
    seedProfiles();
    seedTemplate(TPL);
    seedWeddings([]);
    db.rows.guest_drafts = [];
    storage.list.mockImplementation(async () => [`${TPL}/v1.0.0/index.html`]);
    storage.delete.mockImplementation(async () => {
      throw new Error("backblaze exploded");
    });

    const res = await runDelete(TPL);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.step).toBe("storage");
    expect(body.objectsDeleted).toBe(0);
    // Template row still present so a retry can finish.
    expect(db.rows.templates).toHaveLength(1);
  });

  it("obeys the admin destructive rate limit", async () => {
    seedProfiles();
    consumeRateLimit.mockResolvedValueOnce({ allowed: false });
    const res = await runDelete(TPL);
    expect(res.status).toBe(429);
  });
});