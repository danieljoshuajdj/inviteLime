import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminPreviewMode } from "./admin-preview";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAdminPreviewMode", () => {
  it("is off when the flag is absent", () => {
    vi.stubEnv("ADMIN_UI_PREVIEW", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isAdminPreviewMode()).toBe(false);
  });

  it("is off for any flag value other than 1", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const value of ["0", "true", "yes", ""]) {
      vi.stubEnv("ADMIN_UI_PREVIEW", value);
      expect(isAdminPreviewMode()).toBe(false);
    }
  });

  it("is on when the flag is 1 outside production", () => {
    vi.stubEnv("ADMIN_UI_PREVIEW", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(isAdminPreviewMode()).toBe(true);
  });

  it("stays off in production even when the flag is 1", () => {
    vi.stubEnv("ADMIN_UI_PREVIEW", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isAdminPreviewMode()).toBe(false);
  });
});
