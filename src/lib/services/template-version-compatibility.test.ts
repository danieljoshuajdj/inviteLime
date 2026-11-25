import { describe, expect, it, vi } from "vitest";

import type { Supabase } from "@/lib/services/helpers";
import type { ObjectStorage } from "@/lib/services/storage";
import { verifyTemplateVersionCompatibility } from "@/lib/services/template-version-compatibility";

const TPL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VERSION = "22222222-2222-4222-8222-222222222222";

interface Row {
  id: string;
  [key: string]: unknown;
}

interface Filter {
  column: string;
  value: unknown;
  op: "eq" | "in";
}

class FakeQuery {
  private filters: Filter[] = [];
  private singleMode = false;

  constructor(
    private readonly table: string,
    private readonly db: FakeDb
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, op: "eq" });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, value: values, op: "in" });
    return this;
  }

  maybeSingle() {
    this.singleMode = true;
    return this.resolve();
  }

  then<TResult>(onfulfilled?: (value: unknown) => TResult | PromiseLike<TResult>): Promise<TResult> {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private resolve(): { data: unknown; error: null } {
    const rows = (this.db.rows[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => {
        const value = row[filter.column];
        if (filter.op === "eq") return value === filter.value;
        return (filter.value as unknown[]).includes(value);
      })
    );
    return { data: this.singleMode ? rows[0] ?? null : rows, error: null };
  }
}

class FakeDb {
  rows: Record<string, Row[]> = {};
  from(table: string) {
    return new FakeQuery(table, this);
  }
}

function storage(html: string | null = "<!doctype html><html><body>ok</body></html>") {
  return {
    download: vi.fn(async () => (html === null ? null : { body: Buffer.from(html), contentType: "text/html" })),
  } as unknown as ObjectStorage;
}

function database(options: {
  templateStatus?: string;
  formType?: string;
  manifestFeatures?: Record<string, unknown>;
  versionStatus?: string;
  deleteAfter?: string | null;
  retiredAt?: string | null;
  storagePrefix?: string;
  weddings?: Row[];
  drafts?: Row[];
} = {}) {
  const db = new FakeDb();
  db.rows.templates = [
    {
      id: TPL,
      name: "Test template",
      form_type: options.formType ?? "wedding",
      status: options.templateStatus ?? "active",
    },
  ];
  db.rows.template_versions = [
    {
      id: VERSION,
      template_id: TPL,
      version: "1.0.1",
      storage_prefix: options.storagePrefix ?? `${TPL}/v1.0.1`,
      manifest: {
        entry: "index.html",
        features: options.manifestFeatures ?? { rsvp: true },
      },
      status: options.versionStatus ?? "draft",
      delete_after: options.deleteAfter ?? null,
      retired_at: options.retiredAt ?? null,
    },
  ];
  db.rows.weddings = options.weddings ?? [];
  db.rows.guest_drafts = options.drafts ?? [];
  return db;
}

function wedding(overrides: Partial<Row> = {}): Row {
  return {
    id: "w1",
    slug: "sample-wedding",
    status: "active",
    form_type: "wedding",
    template_id: TPL,
    bride_name: "A",
    groom_name: "B",
    rsvp_toggle: false,
    planner_id: null,
    template_version_id: VERSION,
    wedding_data: {},
    ...overrides,
  };
}

function draft(overrides: Partial<Row> = {}): Row {
  return {
    id: "d1",
    template_id: TPL,
    template_version_id: VERSION,
    wedding_data: {},
    ...overrides,
  };
}

function verify(
  db: FakeDb,
  options: {
    purpose?: "publish" | "rollback" | "retire";
    store?: ObjectStorage;
    sourceVersionIds?: string[];
  } = {}
) {
  return verifyTemplateVersionCompatibility({
    supabase: db as unknown as Supabase,
    templateId: TPL,
    versionId: VERSION,
    storage: options.store ?? storage(),
    purpose: options.purpose ?? "publish",
    ...(options.sourceVersionIds ? { sourceVersionIds: options.sourceVersionIds } : {}),
  });
}

describe("verifyTemplateVersionCompatibility", () => {
  it("passes a readable package with no conflicting live data", async () => {
    const result = await verify(database());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.affectedInvitations).toBe(0);
  });

  it("blocks a live invitation whose saved data uses a dropped gallery feature", async () => {
    const result = await verify(
      database({
        manifestFeatures: { gallery: false },
        weddings: [
          wedding({
            wedding_data: {
              includeGallery: true,
              gallery: [{ role: "gallery", url: "/photo.jpg" }],
            },
          }),
        ],
      })
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "feature-missing",
          feature: "gallery",
          invitationId: "w1",
          invitationSlug: "sample-wedding",
        }),
      ])
    );
    expect(result.activeInvitations).toBe(1);
  });

  it("warns instead of blocking when only a builder draft uses a dropped feature", async () => {
    const result = await verify(
      database({
        manifestFeatures: { gallery: false },
        drafts: [
          draft({
            wedding_data: {
              includeGallery: true,
              gallery: [{ role: "gallery", url: "/photo.jpg" }],
            },
          }),
        ],
      })
    );

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/builder draft uses "gallery"/i);
  });

  it("ignores features that the saved data does not use", async () => {
    const result = await verify(
      database({
        manifestFeatures: { gallery: false, events: false, rsvp: false },
        weddings: [
          wedding({
            rsvp_toggle: false,
            wedding_data: { includeGallery: false, gallery: [], events: [] },
          }),
        ],
      })
    );
    expect(result.ok).toBe(true);
  });

  it("warns on a form-type mismatch but keeps the package eligible", async () => {
    const result = await verify(
      database({
        formType: "birthday_celebration",
        weddings: [wedding({ form_type: "wedding" })],
      })
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/different event form/i);
  });

  it("blocks a package whose entry is missing", async () => {
    const result = await verify(database(), { store: storage(null) });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("entry-missing");
  });

  it("blocks a package whose entry is not HTML", async () => {
    const result = await verify(database(), { store: storage("not html") });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("invalid-html");
  });

  it("blocks a package it cannot read from storage", async () => {
    const store = {
      download: vi.fn(async () => {
        throw new Error("B2 unavailable");
      }),
    } as unknown as ObjectStorage;
    const result = await verify(database(), { store });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("package-unavailable");
    expect(result.issues[0]?.message).toMatch(/B2 unavailable/);
  });

  it("blocks an unsafe storage prefix without reading storage", async () => {
    const store = storage();
    const result = await verify(database({ storagePrefix: "shared/v1" }), { store });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("unsafe-prefix");
    expect(store.download).not.toHaveBeenCalled();
  });

  it("rejects a previous version past its retention window for rollback", async () => {
    const result = await verify(
      database({
        versionStatus: "previous",
        deleteAfter: new Date(Date.now() - 1000).toISOString(),
      }),
      { purpose: "rollback" }
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(/retention window/i);
  });

  it("rejects a version in the wrong lifecycle state for the action", async () => {
    const result = await verify(database({ versionStatus: "published" }), {
      purpose: "rollback",
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "wrong-status" })])
    );
  });

  it("only checks invitations pinned to the expiring release during retirement", async () => {
    const db = database({
      versionStatus: "published",
      weddings: [
        wedding({ id: "moved", template_version_id: VERSION }),
        wedding({ id: "other", template_version_id: "other-version" }),
      ],
    });
    const result = await verify(db, { purpose: "retire", sourceVersionIds: [VERSION] });
    expect(result.affectedInvitations).toBe(1);
  });
});
