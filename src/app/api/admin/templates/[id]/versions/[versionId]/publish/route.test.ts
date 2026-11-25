import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PREV = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const state: {
  user: { id: string } | null;
  role: string;
  version: Record<string, unknown> | null;
  versionCount: number;
  storageFails: boolean;
  compatibility: {
    ok: boolean;
    issues: Array<{ code: string; message: string }>;
    warnings: string[];
    affectedInvitations: number;
    activeInvitations: number;
    affectedDrafts: number;
  };
  publish: { result: unknown; error: string | null };
} = {
  user: { id: ADMIN_ID },
  role: "admin",
  version: null,
  versionCount: 2,
  storageFails: false,
  compatibility: {
    ok: true,
    issues: [],
    warnings: [],
    affectedInvitations: 0,
    activeInvitations: 0,
    affectedDrafts: 0,
  },
  publish: { result: null, error: null },
};

const verifyTemplateVersionCompatibility = vi.fn(async (..._args: unknown[]) => state.compatibility);
const publishTemplateVersion = vi.fn(async (..._args: unknown[]) => {
  if (state.publish.error) throw new Error(state.publish.error);
  return state.publish.result;
});
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
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.version, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ count: state.versionCount, data: null, error: null }).then(
            resolve
          ),
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

vi.mock("@/lib/services/template-version-compatibility", () => ({
  verifyTemplateVersionCompatibility: (...args: unknown[]) =>
    verifyTemplateVersionCompatibility(...args),
}));

vi.mock("@/lib/services/template-version-retention", () => ({
  publishTemplateVersion: (...args: unknown[]) => publishTemplateVersion(...args),
  resolveTemplateVersionRetentionHours: () => 72,
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
    new Request(`http://localhost/api/admin/templates/${TPL}/versions/${VER}/publish`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: TPL, versionId: VER }) }
  );
}

beforeEach(() => {
  state.user = { id: ADMIN_ID };
  state.role = "admin";
  state.version = {
    id: VER,
    version: "2.0.0",
    status: "draft",
    is_current: false,
    template_id: TPL,
  };
  state.versionCount = 2;
  state.storageFails = false;
  state.compatibility = {
    ok: true,
    issues: [],
    warnings: [],
    affectedInvitations: 0,
    activeInvitations: 0,
    affectedDrafts: 0,
  };
  state.publish = {
    result: {
      ok: true,
      alreadyCurrent: false,
      versionId: VER,
      version: "2.0.0",
      previous: {
        id: PREV,
        version: "1.0.0",
        deleteAfter: "2026-11-27T10:00:00.000Z",
      },
      repointedInvitations: 4,
      repointedDrafts: 1,
      retentionHours: 72,
    },
    error: null,
  };
  verifyTemplateVersionCompatibility.mockClear();
  publishTemplateVersion.mockClear();
  logAdminAction.mockClear();
});

describe("POST /api/admin/templates/[id]/versions/[versionId]/publish", () => {
  it("returns 401 when nobody is signed in", async () => {
    state.user = null;
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a signed-in customer", async () => {
    state.role = "customer";
    const res = await call();
    expect(res.status).toBe(403);
    expect(verifyTemplateVersionCompatibility).not.toHaveBeenCalled();
  });

  it("returns 404 for a version that does not belong to the template", async () => {
    state.version = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(publishTemplateVersion).not.toHaveBeenCalled();
  });

  it("refuses a version that is still uploading", async () => {
    state.version = { ...state.version, status: "uploading" };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("UPLOAD_IN_PROGRESS");
    expect(verifyTemplateVersionCompatibility).not.toHaveBeenCalled();
  });

  it("refuses a retired version", async () => {
    state.version = { ...state.version, status: "retired" };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_RETIRED");
  });

  it("refuses a version that is already current", async () => {
    state.version = { ...state.version, status: "published", is_current: true };
    const res = await call();
    expect(res.status).toBe(409);
    expect(publishTemplateVersion).not.toHaveBeenCalled();
  });

  it("refuses a non-draft version and points the admin to Restore", async () => {
    state.version = { ...state.version, status: "previous" };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_A_DRAFT");
  });

  it("returns 503 without switching anything when storage is unavailable", async () => {
    state.storageFails = true;
    const res = await call();
    expect(res.status).toBe(503);
    expect(publishTemplateVersion).not.toHaveBeenCalled();
  });

  it("refuses an incompatible package and audits the blocked attempt", async () => {
    state.compatibility = {
      ok: false,
      issues: [
        {
          code: "feature-missing",
          message: 'Invitation abc uses "gallery", but this version declares it unavailable.',
        },
      ],
      warnings: [],
      affectedInvitations: 1,
      activeInvitations: 1,
      affectedDrafts: 0,
    };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_INCOMPATIBLE");
    expect(publishTemplateVersion).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      "template.version_publish_blocked",
      "template_version",
      VER,
      expect.objectContaining({ templateId: TPL, version: "2.0.0" })
    );
  });

  it("reports a missing migration instead of a generic failure", async () => {
    state.publish.error =
      "function publish_template_version(uuid, uuid, integer) does not exist";
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });

  it("keeps the current version when the database rejects the switch", async () => {
    state.publish.error = "UPLOAD_IN_PROGRESS";
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("UPLOAD_IN_PROGRESS");
  });

  it("reports an unexpected database failure as publish failed", async () => {
    state.publish.error = "connection reset";
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("PUBLISH_FAILED");
  });

  it("publishes, reports the repointed invitations and audits the change", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      version: "2.0.0",
      status: "published",
      isCurrent: true,
      repointedInvitations: 4,
      repointedDrafts: 1,
      retentionHours: 72,
      versionCount: 2,
    });
    expect(json.previous).toEqual({
      id: PREV,
      version: "1.0.0",
      deleteAfter: "2026-11-27T10:00:00.000Z",
    });
    expect(publishTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: TPL, versionId: VER, retentionHours: 72 })
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      "template.version_publish",
      "template_version",
      VER,
      expect.objectContaining({
        templateId: TPL,
        version: "2.0.0",
        repointedInvitations: 4,
        retentionHours: 72,
      })
    );
  });

  it("surfaces compatibility warnings on a successful publish", async () => {
    state.compatibility.warnings = [
      "A builder draft uses a feature this version drops.",
    ];
    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.warnings).toEqual([
      "A builder draft uses a feature this version drops.",
    ]);
  });
});
