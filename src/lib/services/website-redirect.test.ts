import { beforeEach, describe, expect, it, vi } from "vitest";

const getSetting = vi.fn();
const getSettingFresh = vi.fn();
const updateSetting = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/site-settings", () => ({
  getSetting: (...args: unknown[]) => getSetting(...args),
  getSettingFresh: (...args: unknown[]) => getSettingFresh(...args),
  updateSetting: (...args: unknown[]) => updateSetting(...args),
}));

import {
  getWebsiteRedirectDestination,
  getWebsiteRedirectState,
  setWebsiteRedirectDestination,
  WEBSITE_REDIRECT_SETTING_KEY,
} from "./website-redirect";

beforeEach(() => {
  getSetting.mockReset();
  getSettingFresh.mockReset();
  updateSetting.mockReset();
});

describe("getWebsiteRedirectDestination", () => {
  it("returns the normalised saved destination", async () => {
    getSetting.mockResolvedValue("https://mywebsite.com");
    await expect(getWebsiteRedirectDestination()).resolves.toBe(
      "https://mywebsite.com/"
    );
    expect(getSetting).toHaveBeenCalledWith(WEBSITE_REDIRECT_SETTING_KEY, null);
  });

  it("returns null for a missing or invalid stored value", async () => {
    getSetting.mockResolvedValue(undefined);
    await expect(getWebsiteRedirectDestination()).resolves.toBeNull();

    getSetting.mockResolvedValue("javascript:alert(1)");
    await expect(getWebsiteRedirectDestination()).resolves.toBeNull();
  });

  it("uses the uncached read when the caller needs the latest write", async () => {
    getSettingFresh.mockResolvedValue("https://new.example");
    await expect(getWebsiteRedirectDestination({ fresh: true })).resolves.toBe(
      "https://new.example/"
    );
    expect(getSettingFresh).toHaveBeenCalledWith(WEBSITE_REDIRECT_SETTING_KEY, null);
    expect(getSetting).not.toHaveBeenCalled();
  });

  it("never throws when settings are unavailable", async () => {
    getSetting.mockRejectedValue(new Error("database down"));
    await expect(getWebsiteRedirectDestination()).resolves.toBeNull();
  });
});

describe("getWebsiteRedirectState", () => {
  it("always supplies the permanent link and reports whether it is configured", async () => {
    getSetting.mockResolvedValue("https://mywebsite.com");
    await expect(getWebsiteRedirectState("https://invite.example.com")).resolves.toEqual({
      websiteUrl: "https://invite.example.com/visit-website",
      websiteConfigured: true,
    });
  });

  it("keeps the link available when no destination is configured", async () => {
    getSetting.mockResolvedValue("");
    await expect(getWebsiteRedirectState("http://localhost:3000")).resolves.toEqual({
      websiteUrl: "http://localhost:3000/visit-website",
      websiteConfigured: false,
    });
  });

  it("never exposes the configured destination in template data", async () => {
    getSetting.mockResolvedValue("https://private-destination.example/secret");
    const state = await getWebsiteRedirectState("https://invite.example.com");
    expect(state).toEqual({
      websiteUrl: "https://invite.example.com/visit-website",
      websiteConfigured: true,
    });
    expect(JSON.stringify(state)).not.toContain("private-destination");
  });
});

describe("setWebsiteRedirectDestination", () => {
  it("stores the normalised destination", async () => {
    await setWebsiteRedirectDestination("mynewwebsite.com");
    expect(updateSetting).toHaveBeenCalledWith(
      WEBSITE_REDIRECT_SETTING_KEY,
      "https://mynewwebsite.com/"
    );
  });

  it("clears the setting with an empty value", async () => {
    await setWebsiteRedirectDestination(null);
    expect(updateSetting).toHaveBeenCalledWith(WEBSITE_REDIRECT_SETTING_KEY, "");
  });

  it("refuses an invalid non-empty value instead of silently clearing it", async () => {
    await expect(setWebsiteRedirectDestination("javascript:alert(1)")).rejects.toThrow(
      /valid website/i
    );
    expect(updateSetting).not.toHaveBeenCalled();
  });
});
