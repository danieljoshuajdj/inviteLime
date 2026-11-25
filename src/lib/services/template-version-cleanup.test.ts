import { describe, expect, it, vi } from "vitest";

import type { Supabase } from "@/lib/services/helpers";
import type { ObjectStorage } from "@/lib/services/storage";
import {
  cleanupStaleVersionUploads,
  cleanupSupersededDraftVersions,
  deleteTemplateVersionObjects,
  isSafeTemplateVersionPrefix,
  purgeDueTemplateVersions,
  purgeTemplateVersion,
  selectSupersededVersions,
  type TemplateVersionRow,
} from "@/lib/services/template-version-cleanup";

const TPL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const V3 = "33333333-3333-4333-8333-333333333333";
const V4 = "44444444-4444-4444-8444-444444444444";

interface Row {
  id: string;
  [key: string]: unknown;
}

interface Filter {
  column: string;
  value: unknown;
  op: "eq" | "neq" | "lte" | "in";
}

class FakeQuery {
  private filters: Filter[] = [];
  private pending: { type: "update" | "delete"; values?: Record<string, unknown> } | null = null;
  private limitCount: number | null = null;
  private singleMode = false;
  private returnDeleted = false;

  constructor(
    private readonly table: string,
    private readonly db: FakeDb
  ) {}

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

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, op: "eq" });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, value, op: "neq" });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, value, op: "lte" });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, value: values, op: "in" });
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
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

  then<TResult>(onfulfilled?: (value: unknown) => TResult | PromiseLike<TResult>): Promise<TResult> {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const value = row[filter.column];
      if (filter.op === "eq") return value === filter.value;
      if (filter.op === "neq") return value !== filter.value;
      if (filter.op === "in") return (filter.value as unknown[]).includes(value);
      return value != null && String(value) <= String(filter.value);
    });
  }

  private resolve(): { data: unknown; error: { code?: string; message?: string } | null } {
    const rows = this.db.rows[this.table] ?? [];
    const matched = rows.filter((row) => this.matches(row));

    if (this.pending?.type === "delete") {
      const deleted = this.returnDeleted ? matched.map((row) => ({ ...row })) : null;
      this.db.rows[this.table] = rows.filter((row) => !this.matches(row));
      return { data: deleted, error: null };
    }

    if (this.pending?.type === "update") {
      const values = this.pending.values ?? {};
      this.db.rows[this.table] = rows.map((row) =>
        this.matches(row) ? { ...row, ...values } : row
      );
      return { data: null, error: null };
    }

    const limited = this.limitCount == null ? matched : matched.slice(0, this.limitCount);
    if (this.singleMode) return { data: limited[0] ?? null, error: null };
    return { data: limited, error: null };
  }
}

class FakeDb {
  rows: Record<string, Row[]> = {};
  from(table: string) {
    return new FakeQuery(table, this);
  }
  rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn !== "retire_template_version") {
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    }
    const rows = this.rows.template_versions ?? [];
    const row = rows.find(
      (item) =>
        item.id === args?.p_version_id &&
        item.template_id === args?.p_template_id &&
        item.status === "previous"
    );
    if (!row) {
      return { data: null, error: { message: "Template version not found" } };
    }
    row.status = "retired";
    row.is_current = false;
    row.retired_at = new Date().toISOString();
    return {
      data: { ok: true, versionId: row.id, version: row.version },
      error: null,
    };
  });
}

function version(
  id: string,
  name: string,
  createdAt: string,
  overrides: Partial<TemplateVersionRow> = {}
): TemplateVersionRow {
  return {
    id,
    version: name,
    storage_prefix: `${TPL}/v${name}`,
    status: "draft",
    is_current: false,
    created_at: createdAt,
    ...overrides,
  };
}

function createStorage(keys: string[]): ObjectStorage & {
  keys: Set<string>;
  list: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const set = new Set(keys);
  return {
    keys: set,
    list: vi.fn(async (_bucket: string, prefix: string) =>
      [...set].filter((key) => key.startsWith(prefix))
    ),
    delete: vi.fn(async (_bucket: string, key: string) => {
      set.delete(key);
    }),
    upload: vi.fn(),
    download: vi.fn(async () => ({
      body: Buffer.from("<!doctype html><html><body>ok</body></html>"),
      contentType: "text/html",
    })),
    exists: vi.fn(),
    move: vi.fn(),
    copy: vi.fn(),
    signedUrl: vi.fn(),
    publicUrl: vi.fn(),
  } as unknown as ObjectStorage & {
    keys: Set<string>;
    list: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

function seed(
  versions: TemplateVersionRow[],
  options: {
    weddings?: Row[];
    drafts?: Row[];
    thumbnail?: string | null;
  } = {}
) {
  const db = new FakeDb();
  db.rows.template_versions = versions.map((row) => ({
    template_id: TPL,
    ...row,
  })) as unknown as Row[];
  db.rows.weddings = options.weddings ?? [];
  db.rows.guest_drafts = options.drafts ?? [];
  db.rows.templates = [
    {
      id: TPL,
      thumbnail_path: options.thumbnail === undefined ? `${TPL}/thumbnail` : options.thumbnail,
      preview_gif_path: null,
    },
  ];
  return db;
}

function runDraftCleanup(
  db: FakeDb,
  storage: ObjectStorage,
  newVersionId: string
) {
  return cleanupSupersededDraftVersions({
    supabase: db as unknown as Supabase,
    templateId: TPL,
    newVersionId,
    storage,
  });
}

describe("selectSupersededVersions", () => {
  it("returns only rows older than the new version", () => {
    const rows = [
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z"),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z"),
      version(V3, "1.0.2", "2026-01-03T00:00:00.000Z"),
      version(V4, "1.0.3", "2026-01-04T00:00:00.000Z"),
    ];
    expect(selectSupersededVersions(rows, V3).map((row) => row.id)).toEqual([V1, V2]);
  });

  it("returns nothing when the new version is the oldest or unknown", () => {
    const rows = [version(V1, "1.0.0", "2026-01-01T00:00:00.000Z")];
    expect(selectSupersededVersions(rows, V1)).toEqual([]);
    expect(selectSupersededVersions(rows, V3)).toEqual([]);
  });
});

describe("isSafeTemplateVersionPrefix", () => {
  it("accepts only directories inside the template namespace", () => {
    expect(isSafeTemplateVersionPrefix(`${TPL}/v1.0.0`, TPL)).toBe(true);
    expect(isSafeTemplateVersionPrefix(`${TPL}/v1.0.0/`, TPL)).toBe(true);
    expect(isSafeTemplateVersionPrefix("shared/v1.0.0", TPL)).toBe(false);
    expect(isSafeTemplateVersionPrefix(`${TPL}/../other`, TPL)).toBe(false);
    expect(isSafeTemplateVersionPrefix(`${TPL}/`, TPL)).toBe(false);
    expect(isSafeTemplateVersionPrefix(null, TPL)).toBe(false);
  });
});

describe("cleanupSupersededDraftVersions", () => {
  it("removes superseded drafts and leaves the current published release alone", async () => {
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z"),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
        status: "published",
        is_current: true,
      }),
      version(V3, "1.0.2", "2026-01-03T00:00:00.000Z"),
    ]);
    const storage = createStorage([
      `${TPL}/v1.0.0/index.html`,
      `${TPL}/v1.0.1/index.html`,
      `${TPL}/v1.0.2/index.html`,
      `${TPL}/thumbnail`,
    ]);

    const result = await runDraftCleanup(db, storage, V3);

    expect(result.deletedVersions.map((item) => item.version)).toEqual(["1.0.0"]);
    expect(result.remainingVersions).toBe(2);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V2, V3]);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(false);
    expect(storage.keys.has(`${TPL}/v1.0.1/index.html`)).toBe(true);
    expect(storage.keys.has(`${TPL}/v1.0.2/index.html`)).toBe(true);
    expect(storage.keys.has(`${TPL}/thumbnail`)).toBe(true);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: "1.0.1", reason: "current-version" }),
      ])
    );
  });

  it("keeps the canonical thumbnail even when the template row has not been updated yet", async () => {
    const db = seed(
      [
        version(V1, "1.0.0", "2026-01-01T00:00:00.000Z"),
        version(V2, "1.0.1", "2026-01-02T00:00:00.000Z"),
      ],
      { thumbnail: null }
    );
    const storage = createStorage([
      `${TPL}/v1.0.0/index.html`,
      `${TPL}/thumbnail`,
    ]);

    const result = await runDraftCleanup(db, storage, V2);

    expect(result.deletedVersions.map((item) => item.version)).toEqual(["1.0.0"]);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(false);
    expect(storage.keys.has(`${TPL}/thumbnail`)).toBe(true);
  });

  it("keeps superseded published releases for the rollback window", async () => {
    const db = seed([
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
        status: "previous",
        is_current: false,
      }),
      version(V3, "1.0.2", "2026-01-03T00:00:00.000Z", {
        status: "published",
        is_current: true,
      }),
    ]);
    const storage = createStorage([
      `${TPL}/v1.0.1/index.html`,
      `${TPL}/v1.0.2/index.html`,
    ]);

    const result = await runDraftCleanup(db, storage, V3);

    expect(result.deletedVersions).toEqual([]);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V2, V3]);
    expect(storage.keys.has(`${TPL}/v1.0.1/index.html`)).toBe(true);
    expect(storage.keys.has(`${TPL}/v1.0.2/index.html`)).toBe(true);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: "1.0.1", reason: "not-a-draft" }),
      ])
    );
  });

  it("keeps a draft that a builder session still references", async () => {
    const db = seed(
      [
        version(V1, "1.0.0", "2026-01-01T00:00:00.000Z"),
        version(V2, "1.0.1", "2026-01-02T00:00:00.000Z"),
      ],
      {
        drafts: [{ id: "draft-1", template_id: TPL, template_version_id: V1 }],
      }
    );
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);

    const result = await runDraftCleanup(db, storage, V2);

    expect(result.deletedVersions).toEqual([]);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V1, V2]);
    expect(db.rows.guest_drafts[0]?.template_version_id).toBe(V1);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(true);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: "1.0.0", reason: "referenced-by-guest-draft" }),
      ])
    );
  });

  it("never deletes a newer version uploaded concurrently", async () => {
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z"),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z"),
      version(V3, "1.0.2", "2026-01-03T00:00:00.000Z"),
      version(V4, "1.0.3", "2026-01-04T00:00:00.000Z", { status: "published", is_current: true }),
    ]);
    const storage = createStorage([
      `${TPL}/v1.0.0/index.html`,
      `${TPL}/v1.0.1/index.html`,
      `${TPL}/v1.0.2/index.html`,
      `${TPL}/v1.0.3/index.html`,
    ]);

    const result = await runDraftCleanup(db, storage, V3);

    expect(result.deletedVersions.map((item) => item.version)).toEqual(["1.0.0", "1.0.1"]);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V3, V4]);
    expect(storage.keys.has(`${TPL}/v1.0.2/index.html`)).toBe(true);
    expect(storage.keys.has(`${TPL}/v1.0.3/index.html`)).toBe(true);
  });

  it("keeps rows and files when a legacy prefix is outside the template namespace", async () => {
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z", { storage_prefix: "shared/v1.0.0" }),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", { status: "published", is_current: true }),
    ]);
    const storage = createStorage([`${TPL}/v1.0.1/index.html`]);

    const result = await runDraftCleanup(db, storage, V2);

    expect(result.deletedVersions).toEqual([]);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V1, V2]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: "1.0.0", reason: "unsafe-storage-prefix" }),
      ])
    );
  });

  it("retries a transient storage failure and still removes the files", async () => {
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z"),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z"),
    ]);
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);
    storage.list.mockRejectedValueOnce(new Error("temporary B2 outage"));

    const result = await runDraftCleanup(db, storage, V2);

    expect(result.deletedVersions.map((item) => item.version)).toEqual(["1.0.0"]);
    // Prefix list + retry, then the orphan sweep lists the template root.
    expect(storage.list).toHaveBeenCalledTimes(3);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(false);
  });
});

describe("purgeTemplateVersion", () => {
  it("deletes a retired version's files first, then its row", async () => {
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z", {
        status: "retired",
        retired_at: "2026-01-05T00:00:00.000Z",
      }),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
        status: "published",
        is_current: true,
      }),
    ]);
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);

    const result = await purgeTemplateVersion({
      supabase: db as unknown as Supabase,
      templateId: TPL,
      versionId: V1,
      storage,
    });

    expect(result.deleted).toBe(true);
    expect(result.deletedObjects).toBe(1);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V2]);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(false);
  });

  it("refuses to purge a version that is not retired", async () => {
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z", { status: "previous" }),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
        status: "published",
        is_current: true,
      }),
    ]);
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);

    const result = await purgeTemplateVersion({
      supabase: db as unknown as Supabase,
      templateId: TPL,
      versionId: V1,
      storage,
    });

    expect(result.deleted).toBe(false);
    expect(result.warnings[0]).toMatch(/only a retired/i);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V1, V2]);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(true);
  });

  it("keeps a retired version that an invitation still references", async () => {
    const db = seed(
      [
        version(V1, "1.0.0", "2026-01-01T00:00:00.000Z", { status: "retired" }),
        version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
          status: "published",
          is_current: true,
        }),
      ],
      {
        weddings: [
          {
            id: "wedding-1",
            template_id: TPL,
            template_version_id: V1,
            status: "active",
            expiration_date: "2999-01-01",
          },
        ],
      }
    );
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);

    const result = await purgeTemplateVersion({
      supabase: db as unknown as Supabase,
      templateId: TPL,
      versionId: V1,
      storage,
    });

    expect(result.deleted).toBe(false);
    expect(result.warnings[0]).toMatch(/invitation still references/i);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V1, V2]);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(true);
  });

  it("keeps the retired row when storage refuses the delete", async () => {
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z", { status: "retired" }),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
        status: "published",
        is_current: true,
      }),
    ]);
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);
    storage.list.mockRejectedValue(new Error("storage down"));

    const result = await purgeTemplateVersion({
      supabase: db as unknown as Supabase,
      templateId: TPL,
      versionId: V1,
      storage,
    });

    expect(result.deleted).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/could not be deleted yet/i);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V1, V2]);
  });

  it("reports an already-deleted version without throwing", async () => {
    const db = seed([]);
    const storage = createStorage([]);

    const result = await purgeTemplateVersion({
      supabase: db as unknown as Supabase,
      templateId: TPL,
      versionId: V1,
      storage,
    });

    expect(result.alreadyDeleted).toBe(true);
    expect(result.deleted).toBe(false);
  });
});

describe("purgeDueTemplateVersions", () => {
  it("retires an expired previous release and purges it in the same run", async () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z", {
        status: "previous",
        replaced_at: "2026-01-03T00:00:00.000Z",
        delete_after: past,
      }),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
        status: "published",
        is_current: true,
        manifest: { entry: "index.html" },
      }),
    ]);
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);

    const result = await purgeDueTemplateVersions({
      supabase: db as unknown as Supabase,
      getStorage: async () => storage,
      now: new Date(),
    });

    expect(result.retired).toBe(1);
    expect(result.purged).toBe(1);
    expect(result.deletedObjects).toBe(1);
    expect(result.failures).toBe(0);
    expect(db.rpc).toHaveBeenCalledWith("retire_template_version", {
      p_template_id: TPL,
      p_version_id: V1,
      p_reason: "expired",
    });
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V2]);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(false);
  });

  it("leaves a previous release inside its window and never touches storage", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const db = seed([
      version(V1, "1.0.0", "2026-01-01T00:00:00.000Z", {
        status: "previous",
        delete_after: future,
      }),
      version(V2, "1.0.1", "2026-01-02T00:00:00.000Z", {
        status: "published",
        is_current: true,
      }),
    ]);
    const getStorage = vi.fn(async () => createStorage([]));

    const result = await purgeDueTemplateVersions({
      supabase: db as unknown as Supabase,
      getStorage,
      now: new Date(),
    });

    expect(result).toMatchObject({ retired: 0, purged: 0, failures: 0 });
    expect(getStorage).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V1, V2]);
  });
});

describe("cleanupStaleVersionUploads", () => {
  it("removes only claims older than the grace period", async () => {
    const db = seed([
      version(V1, "1.0.0", "2020-01-01T00:00:00.000Z", { status: "uploading" }),
      version(V2, "1.0.1", new Date().toISOString(), { status: "uploading" }),
    ]);
    const storage = createStorage([`${TPL}/v1.0.0/index.html`]);

    const result = await cleanupStaleVersionUploads({
      supabase: db as unknown as Supabase,
      templateId: TPL,
      storage,
    });

    expect(result.deletedVersions.map((item) => item.version)).toEqual(["1.0.0"]);
    expect(db.rows.template_versions.map((row) => row.id)).toEqual([V2]);
    expect(storage.keys.has(`${TPL}/v1.0.0/index.html`)).toBe(false);
  });
});

describe("deleteTemplateVersionObjects", () => {
  it("refuses unsafe prefixes without touching storage", async () => {
    const storage = createStorage(["shared/v1.0.0/index.html"]);
    const result = await deleteTemplateVersionObjects(storage, TPL, "shared/v1.0.0");
    expect(result.deleted).toBe(0);
    expect(result.error?.message).toMatch(/unsafe/i);
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
