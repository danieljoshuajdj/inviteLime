import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const getSetting = vi.fn();
const getSettingFresh = vi.fn();
const updateSetting = vi.fn();
const auditRows: Array<Record<string, unknown>> = [];

const state = {
  user: { id: ADMIN_ID } as { id: string } | null,
  role: "admin" as string | null,
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/site-settings", () => ({
  getSetting: (...args: unknown[]) => getSetting(...args),
  getSettingFresh: (...args: unknown[]) => getSettingFresh(...args),
  updateSetting: (...args: unknown[]) => updateSetting(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.user && state.role ? { id: state.user.id, role: state.role } : null,
              error: null,
            }),
          }),
        }),
      };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "audit_logs") throw new Error(`Unexpected table ${table}`);
      return {
        insert: async (row: Record<string, unknown>) => {
          auditRows.push(row);
          return { data: null, error: null };
        },
      };
    },
  }),
}));

const { GET, PUT } = await import("./route");

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/admin/settings/website", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  state.user = { id: ADMIN_ID };
  state.role = "admin";
  auditRows.length = 0;
  getSetting.mockReset().mockResolvedValue("");
  getSettingFresh.mockReset();
  updateSetting.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/admin/settings/website", () => {
  it("returns the saved destination for an admin", async () => {
    getSetting.mockResolvedValue("https://mywebsite.com");
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      websiteUrl: "https://mywebsite.com/",
    });
  });

  it("returns null when no destination is configured", async () => {
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ websiteUrl: null });
  });

  it("rejects signed-out visitors", async () => {
    state.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getSetting).not.toHaveBeenCalled();
  });

  it("rejects non-admin accounts", async () => {
    state.role = "customer";
    const res = await GET();
    expect(res.status).toBe(403);
    expect(getSetting).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/settings/website", () => {
  it("normalises and saves the destination, then audits the change", async () => {
    getSetting.mockResolvedValue("https://old.example");

    const res = await put({ url: "mynewwebsite.com" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      websiteUrl: "https://mynewwebsite.com/",
    });
    expect(updateSetting).toHaveBeenCalledWith(
      "website_redirect_url",
      "https://mynewwebsite.com/"
    );
    expect(auditRows).toEqual([
      expect.objectContaining({
        admin_id: ADMIN_ID,
        action: "settings.website_redirect.update",
        target_type: "site_settings",
        target_id: "website_redirect_url",
        metadata: {
          previous: "https://old.example/",
          next: "https://mynewwebsite.com/",
        },
      }),
    ]);
  });

  it("clears the destination with an empty value", async () => {
    const res = await put({ url: "   " });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ websiteUrl: null });
    expect(updateSetting).toHaveBeenCalledWith("website_redirect_url", "");
  });

  it("rejects unsafe or malformed URLs without writing", async () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.com",
      "https://user:pass@example.com",
      "mywebsite",
    ]) {
      const res = await put({ url });
      expect(res.status, url).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: expect.stringMatching(/valid website/i),
      });
    }
    expect(updateSetting).not.toHaveBeenCalled();
    expect(auditRows).toHaveLength(0);
  });

  it("rejects a missing url field and over-long values", async () => {
    const missing = await put({});
    expect(missing.status).toBe(400);

    const tooLong = await put({ url: `https://example.com/${"a".repeat(3000)}` });
    expect(tooLong.status).toBe(400);

    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("rejects signed-out and non-admin callers before reading or writing", async () => {
    state.user = null;
    const signedOut = await put({ url: "https://example.com" });
    expect(signedOut.status).toBe(401);

    state.user = { id: ADMIN_ID };
    state.role = "planner";
    const nonAdmin = await put({ url: "https://example.com" });
    expect(nonAdmin.status).toBe(403);

    expect(getSetting).not.toHaveBeenCalled();
    expect(updateSetting).not.toHaveBeenCalled();
    expect(auditRows).toHaveLength(0);
  });

  it("does not write or audit when the settings store fails", async () => {
    updateSetting.mockRejectedValue(new Error("database down"));

    const res = await put({ url: "https://example.com" });

    expect(res.status).toBe(400);
    expect(auditRows).toHaveLength(0);
  });
});
