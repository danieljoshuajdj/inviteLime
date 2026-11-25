import { describe, expect, it } from "vitest";

import type { Supabase } from "@/lib/services/helpers";
import { resolveInvitationTemplateSources } from "@/lib/services/template-runtime";

const TEMPLATE = "11111111-1111-4111-8111-111111111111";
const OTHER_TEMPLATE = "99999999-9999-4999-8999-999999999999";

interface Row {
  id: string;
  template_id: string;
  status: string;
  is_current: boolean;
  [key: string]: unknown;
}

interface Filter {
  column: string;
  value: unknown;
  op: "eq" | "in";
}

class FakeQuery {
  private filters: Filter[] = [];

  constructor(private readonly db: FakeDb) {}

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
    return this.resolve();
  }

  then<TResult>(onfulfilled?: (value: unknown) => TResult | PromiseLike<TResult>): Promise<TResult> {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private resolve(): { data: Row | null; error: null } {
    const row =
      this.db.rows.find((candidate) =>
        this.filters.every((filter) => {
          const value = candidate[filter.column];
          return filter.op === "eq"
            ? value === filter.value
            : (filter.value as unknown[]).includes(value);
        })
      ) ?? null;
    return { data: row, error: null };
  }
}

class FakeDb {
  constructor(readonly rows: Row[]) {}
  from() {
    return new FakeQuery(this);
  }
}

function version(
  id: string,
  options: {
    templateId?: string;
    version?: string;
    status?: string;
    current?: boolean;
  } = {}
): Row {
  const templateId = options.templateId ?? TEMPLATE;
  return {
    id,
    template_id: templateId,
    version: options.version ?? "1.0.0",
    status: options.status ?? "published",
    is_current: options.current ?? false,
    storage_prefix: `${templateId}/v${options.version ?? "1.0.0"}`,
    manifest: { entry: "index.html" },
    templates: {
      id: templateId,
      name: "Test template",
      slug: "test-template",
      form_type: "wedding",
    },
  };
}

function resolve(
  db: FakeDb,
  pinnedId: string | null,
  templateId: string | null | undefined = TEMPLATE
) {
  return resolveInvitationTemplateSources(
    db as unknown as Supabase,
    pinnedId,
    templateId
  );
}

describe("resolveInvitationTemplateSources", () => {
  it("uses a current pinned release without a second lookup", async () => {
    const db = new FakeDb([
      version("current", { version: "1.0.2", current: true }),
    ]);

    const result = await resolve(db, "current");
    expect(result?.preferred.versionId).toBe("current");
    expect(result?.fallback).toBeNull();
  });

  it("prefers the live release when the invitation still pins a previous one", async () => {
    const db = new FakeDb([
      version("previous", { version: "1.0.1", status: "previous" }),
      version("current", { version: "1.0.2", current: true }),
    ]);

    const result = await resolve(db, "previous");
    expect(result?.preferred.versionId).toBe("current");
    expect(result?.fallback?.versionId).toBe("previous");
  });

  it("resolves the live release when the pinned row was already purged", async () => {
    const db = new FakeDb([
      version("current", { version: "1.0.2", current: true }),
    ]);

    const result = await resolve(db, "deleted-version");
    expect(result?.preferred.versionId).toBe("current");
    expect(result?.fallback).toBeNull();
  });

  it("keeps the pinned previous release when no live release exists", async () => {
    const db = new FakeDb([
      version("previous", { version: "1.0.1", status: "previous" }),
    ]);

    const result = await resolve(db, "previous");
    expect(result?.preferred.versionId).toBe("previous");
    expect(result?.fallback).toBeNull();
  });

  it("never falls back to a version owned by another template", async () => {
    const db = new FakeDb([
      version("foreign", {
        templateId: OTHER_TEMPLATE,
        version: "9.9.9",
        status: "previous",
      }),
      version("current", { version: "1.0.2", current: true }),
    ]);

    const result = await resolve(db, "foreign");
    expect(result?.preferred.versionId).toBe("current");
    expect(result?.fallback).toBeNull();
  });

  it("returns null when neither the template nor a pinned release is known", async () => {
    const db = new FakeDb([]);
    expect(await resolve(db, null, null)).toBeNull();
  });
});
