import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VER_CURRENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VER_PREVIOUS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const state: {
  user: { id: string } | null;
  role: string;
  history: {
    template: { id: string; name: string; slug: string } | null;
    versions: Array<Record<string, unknown>>;
  };
} = {
  user: { id: ADMIN_ID },
  role: "admin",
  history: { template: null, versions: [] },
};

const listTemplateVersionHistory = vi.fn(async (..._args: unknown[]) => state.history);

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.user ? { role: state.role } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({}) }),
}));

vi.mock("@/lib/services/template-version-retention", () => ({
  listTemplateVersionHistory: (...args: unknown[]) =>
    listTemplateVersionHistory(...args),
  resolveTemplateVersionRetentionHours: () => 72,
}));

import { GET } from "./route";

function call() {
  return GET(new Request(`http://localhost/api/admin/templates/${TPL}/versions`), {
    params: Promise.resolve({ id: TPL }),
  });
}

beforeEach(() => {
  state.user = { id: ADMIN_ID };
  state.role = "admin";
  state.history = {
    template: { id: TPL, name: "Royal Mughal", slug: "royal-mughal" },
    versions: [
      {
        id: VER_CURRENT,
        version: "2.0.0",
        state: "current",
        isCurrent: true,
        publishedAt: "2026-11-20T10:00:00.000Z",
        replacedAt: null,
        deleteAfter: null,
        retiredAt: null,
        retirementReason: null,
        remainingMs: null,
        canRestore: false,
        previewUrl: `/templates/royal-mughal/demo?version=${VER_CURRENT}`,
      },
      {
        id: VER_PREVIOUS,
        version: "1.1.0",
        state: "previous",
        isCurrent: false,
        publishedAt: "2026-11-01T10:00:00.000Z",
        replacedAt: "2026-11-20T10:00:00.000Z",
        deleteAfter: "2099-01-01T00:00:00.000Z",
        retiredAt: null,
        retirementReason: null,
        remainingMs: 60_000,
        canRestore: true,
        previewUrl: `/templates/royal-mughal/demo?version=${VER_PREVIOUS}`,
      },
    ],
  };
  listTemplateVersionHistory.mockClear();
});

describe("GET /api/admin/templates/[id]/versions", () => {
  it("returns 401 when nobody is signed in", async () => {
    state.user = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(listTemplateVersionHistory).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in customer", async () => {
    state.role = "customer";
    const res = await call();
    expect(res.status).toBe(403);
    expect(listTemplateVersionHistory).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown template", async () => {
    state.history = { template: null, versions: [] };
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("returns the release history and retention window for an admin", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      retentionHours: 72,
      template: { id: TPL, name: "Royal Mughal", slug: "royal-mughal" },
    });
    expect(json.versions).toHaveLength(2);
    expect(json.versions[0]).toMatchObject({ id: VER_CURRENT, state: "current" });
    expect(json.versions[1]).toMatchObject({
      id: VER_PREVIOUS,
      state: "previous",
      canRestore: true,
    });
    expect(listTemplateVersionHistory).toHaveBeenCalledWith(expect.anything(), TPL);
  });
});
