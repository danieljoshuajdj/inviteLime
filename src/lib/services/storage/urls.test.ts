import { afterEach, describe, expect, it } from "vitest";

import { isAlreadyExistsError, StorageError } from "./abstraction";
import { verifyTemplateAssetToken } from "./sign";
import { isBackblazeConfigured, publicObjectUrl, templatePackageBaseUrl } from "./urls";

const B2_ENV = {
  B2_ENDPOINT: "https://s3.us-west-000.backblazeb2.com",
  B2_KEY_ID: "k",
  B2_APPLICATION_KEY: "a",
};

function applyEnv(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
}

function reset() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.B2_ENDPOINT;
  delete process.env.B2_KEY_ID;
  delete process.env.B2_APPLICATION_KEY;
  delete process.env.B2_PUBLIC_BASE_URL;
}

describe("isBackblazeConfigured", () => {
  afterEach(reset);

  it("is true only when the endpoint and an application key pair are set", () => {
    expect(isBackblazeConfigured()).toBe(false);
    applyEnv({ B2_ENDPOINT: "x" });
    expect(isBackblazeConfigured()).toBe(false);
    applyEnv(B2_ENV);
    expect(isBackblazeConfigured()).toBe(true);
  });
});

describe("publicObjectUrl", () => {
  afterEach(reset);

  it("defaults to the Supabase Storage public URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co/";
    expect(publicObjectUrl("templates", "abc/v1.0.0/index.html")).toBe(
      "https://x.supabase.co/storage/v1/object/public/templates/abc/v1.0.0/index.html"
    );
  });

  it("returns a signed /api/templates proxy URL when B2 is configured", () => {
    applyEnv(B2_ENV);
    const url = publicObjectUrl("templates", "abc/v1.0.0/index.html");
    expect(url).toMatch(/^\/api\/templates\/\d+\.[a-f0-9]+\/abc\/v1\.0\.0\/index\.html$/);
    const token = url.replace("/api/templates/", "").split("/")[0];
    expect(verifyTemplateAssetToken(token, "abc/v1.0.0")).toBe(true);
  });

  it("rejects non-template buckets when B2 is configured", () => {
    applyEnv(B2_ENV);
    expect(() => publicObjectUrl("weddings", "x/photo.jpg")).toThrow(/api\/media/);
  });

  it("never emits a double slash between segments", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    expect(publicObjectUrl("templates", "/abc/v1.0.0/")).toBe(
      "https://x.supabase.co/storage/v1/object/public/templates/abc/v1.0.0/"
    );
  });
});

describe("templatePackageBaseUrl", () => {
  afterEach(reset);

  it("returns a trailing-slash immutable version prefix", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co/";
    expect(templatePackageBaseUrl("/abc/v1.0.0/")).toBe(
      "https://x.supabase.co/storage/v1/object/public/templates/abc/v1.0.0/"
    );
  });

  it("returns a signed proxy prefix with B2 configured", () => {
    applyEnv(B2_ENV);
    const url = templatePackageBaseUrl("/abc/v1.0.0/");
    expect(url).toMatch(/^\/api\/templates\/\d+\.[a-f0-9]+\/abc\/v1\.0\.0\/$/);
    const token = url.replace("/api/templates/", "").split("/")[0];
    expect(verifyTemplateAssetToken(token, "abc/v1.0.0")).toBe(true);
  });
});

describe("isAlreadyExistsError", () => {
  it("recognises a StorageError with a 409 status", () => {
    expect(isAlreadyExistsError(new StorageError("nope", 409))).toBe(true);
  });

  it("recognises an error message from the storage backends", () => {
    expect(isAlreadyExistsError(new StorageError('Object with key "x" already exists'))).toBe(true);
    expect(isAlreadyExistsError(new StorageError("The resource already exists"))).toBe(true);
  });

  it("does not misreport other failures", () => {
    expect(isAlreadyExistsError(new StorageError("Bucket not found", 404))).toBe(false);
    expect(isAlreadyExistsError(new Error("some other problem"))).toBe(false);
  });
});