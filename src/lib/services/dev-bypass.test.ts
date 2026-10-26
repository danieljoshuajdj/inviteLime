import { afterEach, describe, expect, it, vi } from "vitest";
import { isPaymentBypassEnabled } from "./dev-bypass";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPaymentBypassEnabled", () => {
  it("is off when the flag is absent", () => {
    vi.stubEnv("DEV_BYPASS_PAYMENT", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isPaymentBypassEnabled()).toBe(false);
  });

  it("is off for any flag value other than exactly 1", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const value of ["0", "true", "yes", "01", "1 ", " 1", ""]) {
      vi.stubEnv("DEV_BYPASS_PAYMENT", value);
      expect(isPaymentBypassEnabled()).toBe(false);
    }
  });

  it("is on when the flag is 1 outside production", () => {
    vi.stubEnv("DEV_BYPASS_PAYMENT", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(isPaymentBypassEnabled()).toBe(true);
  });

  it("stays off in production even when the flag is 1", () => {
    // The critical guarantee: a deployed app can never publish an unpaid
    // invitation, no matter how the env is configured.
    vi.stubEnv("DEV_BYPASS_PAYMENT", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isPaymentBypassEnabled()).toBe(false);
  });
});