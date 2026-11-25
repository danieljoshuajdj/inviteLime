import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const state: {
  user: { id: string } | null;
  role: string;
  websiteUrl: string | null;
} = {
  user: { id: ADMIN_ID },
  role: "admin",
  websiteUrl: null,
};

const getWebsiteRedirectDestination = vi.fn(async () => state.websiteUrl);
const setWebsiteRedirectDestination = vi.fn(async (url: string | null) => {
  state.websiteUrl = url;
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

vi.mock("@/lib/services/website-redirect", () => ({
  getWebsiteRedirectDestination: () => getWebsiteRedirectDestination(),
  setWebsiteRedirectDestination: (url: string | null) =>
    setWebsiteRedirectDestination(url),
  WEBSITE_REDIRECT_SETTING_KEY: "website_redirect_url",
}));

vi.mock("@/lib/services/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/admin")>();
  return {
    ...actual,
    logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  };
});

import { GET, PUT } from "./route";

beforeEach(() => {
  state.user = { id: ADMIN_ID };
  state.role = "admin";
  state.websiteUrl = null;
  getWebsiteRedirectDestination.mockClear();
  setWebsiteRedirectDestination.mockClear();
  logAdminAction.mockClear();
});

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/admin/settings/website", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("GET /api/admin/settings/website", () => {
  it("returns 401 when nobody is signed in", async () => {
    state.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a signed-in customer", async () => {
    state.role = "customer";
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the saved destination to an admin", async () => {
    state.websiteUrl = "https://mywebsite.com/";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ websiteUrl: "https://mywebsite.com/" });
  });
});

describe("PUT /api/admin/settings/website", () => {
  it("refuses a non-admin and never writes", async () => {
    state.role = "customer";
    const res = await put({ url: "https://mywebsite.com" });
    expect(res.status).toBe(403);
    expect(setWebsiteRedirectDestination).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("saves a normalised destination and audits the change", async () => {
    state.websiteUrl = "https://old.example/";
    const res = await put({ url: "https://mywebsite.com" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ websiteUrl: "https://mywebsite.com/" });
    expect(setWebsiteRedirectDestination).toHaveBeenCalledWith(
      "https://mywebsite.com/"
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      "settings.website_redirect.update",
      "site_settings",
      "website_redirect_url",
      { previous: "https://old.example/", next: "https://mywebsite.com/" }
    );
  });

  it("accepts a bare domain by assuming HTTPS", async () => {
    const res = await put({ url: "mynewwebsite.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ websiteUrl: "https://mynewwebsite.com/" });
  });

  it("clears the destination when the field is left blank", async () => {
    state.websiteUrl = "https://mywebsite.com/";
    const res = await put({ url: "   " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ websiteUrl: null });
    expect(setWebsiteRedirectDestination).toHaveBeenCalledWith(null);
  });

  it("rejects an invalid or unsafe URL without writing", async () => {
    for (const url of ["javascript:alert(1)", "ftp://example.com", "mywebsite"]) {
      const res = await put({ url });
      expect(res.status).toBe(400);
    }
    expect(setWebsiteRedirectDestination).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const res = await PUT(
      new Request("http://localhost/api/admin/settings/website", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    );
    expect(res.status).toBe(400);
    expect(setWebsiteRedirectDestination).not.toHaveBeenCalled();
  });

  it("rejects a non-string url", async () => {
    const res = await put({ url: 123 });
    expect(res.status).toBe(400);
    expect(setWebsiteRedirectDestination).not.toHaveBeenCalled();
  });
});
