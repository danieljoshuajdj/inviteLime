import { describe, expect, it, vi } from "vitest";

import type { Supabase } from "@/lib/services/helpers";

const { verifyCore } = vi.hoisted(() => ({
  verifyCore: vi.fn(async () => ({
    ok: true,
    issues: [],
    warnings: [],
    affectedInvitations: 0,
    activeInvitations: 0,
    affectedDrafts: 0,
  })),
}));

vi.mock("@/lib/services/template-version-compatibility", () => ({
  verifyTemplateVersionCompatibility: verifyCore,
}));

import {
  listTemplateVersionHistory,
  publishTemplateVersion,
  resolveTemplateVersionRetentionHours,
  rollbackTemplateVersion,
  verifyTemplateVersionCompatibility,
} from "./template-version-retention";

interface TemplateRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface VersionRow {
  id: string;
  version: string;
  status: string;
  is_current: boolean;
  created_at: string;
  published_at: string | null;
  replaced_at: string | null;
  delete_after: string | null;
  retired_at: string | null;
  retirement_reason: string | null;
}

function versionRow(overrides: Partial<VersionRow> & Pick<VersionRow, "id" | "version">): VersionRow {
  return {
    status: "published",
    is_current: false,
    created_at: "2026-11-01T00:00:00.000Z",
    published_at: null,
    replaced_at: null,
    delete_after: null,
    retired_at: null,
    retirement_reason: null,
    ...overrides,
  };
}

function historyClient(options: {
  template: TemplateRow | null;
  versions: VersionRow[];
}): Supabase {
  return {
    from: (table: string) => ({
      select: () =>
        table === "templates"
          ? {
              eq: () => ({
                maybeSingle: async () => ({
                  data: options.template,
                  error: null,
                }),
              }),
            }
          : {
              eq: () => ({
                order: async () => ({ data: options.versions, error: null }),
              }),
            },
    }),
  } as unknown as Supabase;
}

describe("listTemplateVersionHistory", () => {
  it("returns no template when the id does not exist", async () => {
    const history = await listTemplateVersionHistory(
      historyClient({ template: null, versions: [] }),
      "11111111-1111-4111-8111-111111111111"
    );

    expect(history).toEqual({ template: null, versions: [] });
  });

  it("summarises rows, marks the active release and builds preview links", async () => {
    const history = await listTemplateVersionHistory(
      historyClient({
        template: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Royal Mughal",
          slug: "royal-mughal",
          status: "active",
        },
        versions: [
          versionRow({
            id: "v-current",
            version: "2.0.0",
            is_current: true,
            published_at: "2026-11-20T10:00:00.000Z",
          }),
          versionRow({
            id: "v-previous",
            version: "1.0.0",
            status: "previous",
            replaced_at: "2026-11-20T10:00:00.000Z",
            delete_after: "2099-01-01T00:00:00.000Z",
          }),
          versionRow({ id: "v-draft", version: "2.1.0", status: "draft" }),
        ],
      }),
      "11111111-1111-4111-8111-111111111111"
    );

    expect(history.template?.currentVersion).toBe("2.0.0");
    expect(history.versions.map((version) => version.state)).toEqual([
      "current",
      "previous",
      "draft",
    ]);
    expect(history.versions[1]?.canRestore).toBe(true);
    expect(history.versions[1]?.previewUrl).toBe(
      "/templates/royal-mughal/demo?version=v-previous"
    );
  });
});

describe("verifyTemplateVersionCompatibility re-export", () => {
  function options(purpose: "publish" | "rollback" | "retire") {
    return {
      supabase: {} as Supabase,
      templateId: "template-id",
      versionId: "version-id",
      storage: {} as Parameters<typeof verifyTemplateVersionCompatibility>[0]["storage"],
      purpose,
    };
  }

  it("passes the publish gate through", async () => {
    await verifyTemplateVersionCompatibility(options("publish"));
    expect(verifyCore).toHaveBeenLastCalledWith(
      expect.objectContaining({ purpose: "publish" })
    );
  });

  it("passes the rollback gate through", async () => {
    await verifyTemplateVersionCompatibility(options("rollback"));
    expect(verifyCore).toHaveBeenLastCalledWith(
      expect.objectContaining({ purpose: "rollback" })
    );
  });

  it("passes the retirement gate through", async () => {
    await verifyTemplateVersionCompatibility(options("retire"));
    expect(verifyCore).toHaveBeenLastCalledWith(
      expect.objectContaining({ purpose: "retire" })
    );
  });
});

describe("resolveTemplateVersionRetentionHours", () => {
  it("reads a positive override", () => {
    expect(
      resolveTemplateVersionRetentionHours({
        TEMPLATE_VERSION_RETENTION_HOURS: "24",
      })
    ).toBe(24);
  });

  it("falls back to 72 hours for a missing, invalid or unsafe value", () => {
    for (const value of [undefined, "", "0", "-5", "soon"]) {
      expect(
        resolveTemplateVersionRetentionHours({
          TEMPLATE_VERSION_RETENTION_HOURS: value,
        })
      ).toBe(72);
    }
  });
});

describe("publishTemplateVersion", () => {
  it("passes the retention window to the atomic database function", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        versionId: "version-id",
        version: "3.0.0",
        previous: null,
        repointedInvitations: 2,
        repointedDrafts: 1,
        retentionHours: 48,
      },
      error: null,
    }));

    const result = await publishTemplateVersion({
      supabase: { rpc } as unknown as Supabase,
      templateId: "template-id",
      versionId: "version-id",
      retentionHours: 48,
    });

    expect(rpc).toHaveBeenCalledWith("publish_template_version", {
      p_template_id: "template-id",
      p_version_id: "version-id",
      p_retention_hours: 48,
    });
    expect(result.version).toBe("3.0.0");
    expect(result.repointedInvitations).toBe(2);
  });

  it("surfaces a database error", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "VERSION_RETIRED" },
    }));

    await expect(
      publishTemplateVersion({
        supabase: { rpc } as unknown as Supabase,
        templateId: "template-id",
        versionId: "version-id",
      })
    ).rejects.toThrow("VERSION_RETIRED");
  });
});

describe("rollbackTemplateVersion", () => {
  it("returns the restored version and the rejected one", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        versionId: "old-version",
        version: "1.0.0",
        rejected: { id: "new-version", version: "2.0.0" },
        repointedInvitations: 3,
        repointedDrafts: 0,
      },
      error: null,
    }));

    const result = await rollbackTemplateVersion({
      supabase: { rpc } as unknown as Supabase,
      templateId: "template-id",
      targetVersionId: "old-version",
    });

    expect(rpc).toHaveBeenCalledWith("rollback_template_version", {
      p_template_id: "template-id",
      p_target_version_id: "old-version",
    });
    expect(result.version).toBe("1.0.0");
    expect(result.rejected?.id).toBe("new-version");
  });
});
