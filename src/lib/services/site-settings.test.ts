import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

import { getSettingFresh } from "./site-settings";

beforeEach(() => {
  maybeSingle.mockReset();
  eq.mockClear();
  select.mockClear();
  from.mockClear();
});

describe("getSettingFresh", () => {
  it("reads the requested key directly instead of the request cache", async () => {
    maybeSingle.mockResolvedValue({
      data: { value: "https://mywebsite.com/" },
      error: null,
    });

    await expect(getSettingFresh("website_redirect_url", null)).resolves.toBe(
      "https://mywebsite.com/"
    );
    await getSettingFresh("website_redirect_url", null);

    expect(from).toHaveBeenCalledWith("site_settings");
    expect(select).toHaveBeenCalledWith("value");
    expect(eq).toHaveBeenCalledWith("key", "website_redirect_url");
    // Two calls, two queries: a redirect must see a write made between clicks.
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("falls back when the row is missing or the query fails", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getSettingFresh("missing", "fallback")).resolves.toBe("fallback");

    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "unavailable" },
    });
    await expect(getSettingFresh("missing", "fallback")).resolves.toBe("fallback");

    from.mockImplementationOnce(() => {
      throw new Error("client unavailable");
    });
    await expect(getSettingFresh("missing", "fallback")).resolves.toBe("fallback");
  });
});
