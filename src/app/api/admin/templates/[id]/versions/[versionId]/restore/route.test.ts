import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REJECTED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const state: {
  user: { id: string } | null;
  role: string;
  target: Record<string, unknown> | null;
  rejectedRow: Record<string, unknown> | null;
  compatibility: {
    ok: boolean;
    issues: Array<{ code: string; message: string }>;
    warnings: string[];
    affectedInvitations: number;
    activeInvitations: number;
    affectedDrafts: number;
  };
  storageFails: boolean;
  rollback: {
    result: unknown;
    error: string | null;
  };
  purge: {
    versionId: string;
    version: string | null;
    deleted: boolean;
    alreadyDeleted: boolean;
    deletedObjects: number;
    warnings: string[];
  };
} = {
  user: { id: ADMIN_ID },
  role: "admin",
  target: null,
  rejectedRow: null,
  compatibility: {
    ok: true,
    issues: [],
    warnings: [],
    affectedInvitations: 0,
    activeInvitations: 0,
    affectedDrafts: 0,
  },
  storageFails: false,
  rollback: { result: null, error: null },
  purge: {
    versionId: REJECTED,
    version: "2.0.0",
    deleted: true,
    alreadyDeleted: false,
    deletedObjects: 5,
    warnings: [],
  },
};

const verifyTemplateVersionCompatibility = vi.fn(async (..._args: unknown[]) => state.compatibility);
const rollbackTemplateVersion = vi.fn(async (..._args: unknown[]) => {
  if (state.rollback.error) throw new Error(state.rollback.error);
  return state.rollback.result;
});
const purgeTemplateVersion = vi.fn(async (..._args: unknown[]) => state.purge);
const sweepOrphanedTemplateObjects = vi.fn(async (..._args: unknown[]) => ({
  deleted: 1,
  warnings: [],
}));
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});

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
  createAdminClient: () => ({
    from: () => {
      let columns = "";
      const builder = {
        select: (value: string) => {
          columns = value;
          return builder;
        },
        eq: () => builder,
        maybeSingle: async () => ({
          data: columns.includes("template_id") ? state.target : state.rejectedRow,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/services/storage", () => ({
  getObjectStorage: async () => {
    if (state.storageFails) throw new Error("B2 unavailable");
    return { list: async () => [], delete: async () => {} };
  },
}));

vi.mock("@/lib/services/template-version-cleanup", () => ({
  purgeTemplateVersion: (...args: unknown[]) => purgeTemplateVersion(...args),
  sweepOrphanedTemplateObjects: (...args: unknown[]) =>
    sweepOrphanedTemplateObjects(...args),
}));

vi.mock("@/lib/services/template-version-compatibility", () => ({
  verifyTemplateVersionCompatibility: (...args: unknown[]) =>
    verifyTemplateVersionCompatibility(...args),
}));

vi.mock("@/lib/services/template-version-retention", () => ({
  rollbackTemplateVersion: (...args: unknown[]) => rollbackTemplateVersion(...args),
  TEMPLATE_VERSION_RETENTION_HOURS: 72,
}));

vi.mock("@/lib/services/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/admin")>();
  return {
    ...actual,
    logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  };
});

import { POST } from "./route";

function call() {
  return POST(
    new Request(
      `http://localhost/api/admin/templates/${TPL}/versions/${TARGET}/restore`,
      { method: "POST" }
    ),
    { params: Promise.resolve({ id: TPL, versionId: TARGET }) }
  );
}

beforeEach(() => {
  state.user = { id: ADMIN_ID };
  state.role = "admin";
  state.target = {
    id: TARGET,
    version: "1.0.0",
    status: "previous",
    is_current: false,
    delete_after: "2099-01-01T00:00:00.000Z",
    retired_at: null,
    template_id: TPL,
  };
  state.rejectedRow = { id: REJECTED, version: "2.0.0" };
  state.compatibility = {
    ok: true,
    issues: [],
    warnings: [],
    affectedInvitations: 0,
    activeInvitations: 0,
    affectedDrafts: 0,
  };
  state.storageFails = false;
  state.rollback = {
    result: {
      ok: true,
      versionId: TARGET,
      version: "1.0.0",
      rejected: { id: REJECTED, version: "2.0.0" },
      repointedInvitations: 3,
      repointedDrafts: 2,
    },
    error: null,
  };
  state.purge = {
    versionId: REJECTED,
    version: "2.0.0",
    deleted: true,
    alreadyDeleted: false,
    deletedObjects: 5,
    warnings: [],
  };
  verifyTemplateVersionCompatibility.mockClear();
  rollbackTemplateVersion.mockClear();
  purgeTemplateVersion.mockClear();
  sweepOrphanedTemplateObjects.mockClear();
  logAdminAction.mockClear();
});

describe("POST /api/admin/templates/[id]/versions/[versionId]/restore", () => {
  it("returns 401 when nobody is signed in", async () => {
    state.user = null;
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a signed-in customer", async () => {
    state.role = "customer";
    const res = await call();
    expect(res.status).toBe(403);
    expect(rollbackTemplateVersion).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown version", async () => {
    state.target = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(verifyTemplateVersionCompatibility).not.toHaveBeenCalled();
  });

  it("refuses a version that is not a retained previous release", async () => {
    state.target = { ...state.target, status: "draft" };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_NOT_RESTORABLE");
  });

  it("refuses an already-retired version", async () => {
    state.target = { ...state.target, retired_at: "2026-11-20T10:00:00.000Z" };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_RETIRED");
  });

  it("refuses a version past its retention window", async () => {
    state.target = { ...state.target, delete_after: "2020-01-01T00:00:00.000Z" };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_RETENTION_EXPIRED");
  });

  it("returns 503 without changing anything when storage is unavailable", async () => {
    state.storageFails = true;
    const res = await call();
    expect(res.status).toBe(503);
    expect(rollbackTemplateVersion).not.toHaveBeenCalled();
  });

  it("refuses an incompatible restore and audits the blocked attempt", async () => {
    state.compatibility = {
      ok: false,
      issues: [
        {
          code: "entry-missing",
          message: "The package entry index.html is missing from storage.",
        },
      ],
      warnings: [],
      affectedInvitations: 2,
      activeInvitations: 2,
      affectedDrafts: 0,
    };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_INCOMPATIBLE");
    expect(rollbackTemplateVersion).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      "template.version_rollback_blocked",
      "template_version",
      TARGET,
      expect.objectContaining({ templateId: TPL, version: "1.0.0" })
    );
  });

  it("maps a retention-window rejection from the database to 409", async () => {
    state.rollback.error = "VERSION_RETENTION_EXPIRED";
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_RETENTION_EXPIRED");
    expect(purgeTemplateVersion).not.toHaveBeenCalled();
  });

  it("restores the release, purges the rejected one and audits the change", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      version: "1.0.0",
      status: "published",
      isCurrent: true,
      rejectedVersion: "2.0.0",
      repointedInvitations: 3,
      repointedDrafts: 2,
      cleanup: {
        rejectedVersion: "2.0.0",
        deletedObjects: 6,
        pending: false,
      },
    });
    expect(rollbackTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: TPL, targetVersionId: TARGET })
    );
    expect(purgeTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: TPL, versionId: REJECTED })
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      "template.version_rollback",
      "template_version",
      TARGET,
      expect.objectContaining({
        templateId: TPL,
        restoredVersion: "1.0.0",
        rejectedVersion: "2.0.0",
        repointedInvitations: 3,
      })
    );
  });

  it("reports pending cleanup when the rejected files cannot be purged yet", async () => {
    state.purge = {
      versionId: REJECTED,
      version: "2.0.0",
      deleted: false,
      alreadyDeleted: false,
      deletedObjects: 0,
      warnings: ["v2.0.0 is unavailable, but its files could not be deleted yet: timeout"],
    };
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cleanup.pending).toBe(true);
    expect(json.warnings[0]).toContain("could not be deleted");
  });
});
