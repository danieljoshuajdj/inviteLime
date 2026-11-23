import { describe, expect, it } from "vitest";

import {
  configuredAppOrigin,
  isLocalOrigin,
  isTrustedRequestHost,
  LOCAL_APP_ORIGIN,
  normalizeOrigin,
  requestAppOrigin,
  resolveConfiguredAppOrigin,
  resolvePublicAppOrigin,
  resolveRuntimeAppOrigin,
  type HeaderReader,
} from "./app-origin";

function headers(values: Record<string, string>): HeaderReader {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])
  );
  return { get: (name) => normalized.get(name.toLowerCase()) ?? null };
}

const LOCAL_ENV = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NODE_ENV: "development",
};

const PRODUCTION_ENV = {
  NEXT_PUBLIC_APP_URL: "https://invite.example.com",
  NODE_ENV: "production",
};

const TUNNEL_HOST = "sample-tunnel-3000.inc1.devtunnels.ms";

describe("normalizeOrigin", () => {
  it("accepts bare HTTP(S) origins and strips a trailing slash", () => {
    expect(normalizeOrigin("https://invite.example.com/")).toBe("https://invite.example.com");
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("rejects values that are not a bare origin", () => {
    expect(normalizeOrigin("https://invite.example.com/w/slug")).toBeNull();
    expect(normalizeOrigin("https://invite.example.com?x=1")).toBeNull();
    expect(normalizeOrigin("https://user:pass@invite.example.com")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("https://*.devtunnels.ms")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
  });
});

describe("configuredAppOrigin", () => {
  it("reads only the validated NEXT_PUBLIC_APP_URL value", () => {
    expect(configuredAppOrigin(LOCAL_ENV)).toBe("http://localhost:3000");
    expect(configuredAppOrigin({ ...LOCAL_ENV, NEXT_PUBLIC_APP_URL: "bad" })).toBeNull();
  });

  it("identifies loopback origins", () => {
    expect(isLocalOrigin("http://localhost:3000")).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalOrigin("https://invite.example.com")).toBe(false);
  });
});

describe("requestAppOrigin", () => {
  it("uses the tunnel host and HTTPS forwarded protocol in development", () => {
    const origin = requestAppOrigin(
      headers({
        host: "localhost:3000",
        "x-forwarded-host": TUNNEL_HOST,
        "x-forwarded-proto": "https",
      }),
      { env: LOCAL_ENV }
    );

    expect(origin).toBe(`https://${TUNNEL_HOST}`);
  });

  it("does not depend on the current tunnel identifier", () => {
    const first = requestAppOrigin(
      headers({
        "x-forwarded-host": "aaaa1111-3000.inc1.devtunnels.ms",
        "x-forwarded-proto": "https",
      }),
      { env: LOCAL_ENV }
    );
    const second = requestAppOrigin(
      headers({
        "x-forwarded-host": "bbbb2222-3000.inc1.devtunnels.ms",
        "x-forwarded-proto": "https",
      }),
      { env: LOCAL_ENV }
    );

    expect(first).toBe("https://aaaa1111-3000.inc1.devtunnels.ms");
    expect(second).toBe("https://bbbb2222-3000.inc1.devtunnels.ms");
  });

  it("keeps localhost requests on HTTP", () => {
    expect(
      requestAppOrigin(headers({ host: "localhost:3000" }), { env: LOCAL_ENV })
    ).toBe("http://localhost:3000");
  });

  it("rejects an untrusted host instead of reflecting it", () => {
    expect(
      requestAppOrigin(headers({ host: "evil.example.net" }), { env: LOCAL_ENV })
    ).toBeNull();
    expect(
      requestAppOrigin(
        headers({ "x-forwarded-host": "evil.example.net", "x-forwarded-proto": "https" }),
        { env: LOCAL_ENV }
      )
    ).toBeNull();
  });

  it("rejects hosts that try to smuggle credentials or a path", () => {
    expect(
      requestAppOrigin(
        headers({ "x-forwarded-host": "evil.example.net/path" }),
        { env: LOCAL_ENV }
      )
    ).toBeNull();
    expect(
      requestAppOrigin(
        headers({ "x-forwarded-host": "user@evil.example.net" }),
        { env: LOCAL_ENV }
      )
    ).toBeNull();
  });

  it("ignores an invalid forwarded protocol", () => {
    expect(
      requestAppOrigin(
        headers({
          "x-forwarded-host": TUNNEL_HOST,
          "x-forwarded-proto": "javascript",
        }),
        { env: LOCAL_ENV }
      )
    ).toBe(`https://${TUNNEL_HOST}`);
  });

  it("does not trust development tunnels in production by default", () => {
    expect(
      requestAppOrigin(
        headers({
          "x-forwarded-host": TUNNEL_HOST,
          "x-forwarded-proto": "https",
        }),
        { env: PRODUCTION_ENV }
      )
    ).toBeNull();
  });

  it("allows an explicitly configured tunnel pattern in production", () => {
    const origin = requestAppOrigin(
      headers({
        "x-forwarded-host": TUNNEL_HOST,
        "x-forwarded-proto": "https",
      }),
      {
        env: {
          ...PRODUCTION_ENV,
          TRUSTED_APP_ORIGINS: "https://*.devtunnels.ms",
        },
      }
    );

    expect(origin).toBe(`https://${TUNNEL_HOST}`);
  });

  it("allows an explicitly configured staging origin", () => {
    const origin = requestAppOrigin(
      headers({ host: "staging.example.com", "x-forwarded-proto": "https" }),
      {
        env: {
          ...PRODUCTION_ENV,
          TRUSTED_APP_ORIGINS: "https://staging.example.com",
        },
      }
    );

    expect(origin).toBe("https://staging.example.com");
  });

  it("accepts trusted origins with a port or trailing slash", () => {
    const origin = requestAppOrigin(
      headers({ host: "staging.example.com:8443", "x-forwarded-proto": "https" }),
      {
        env: {
          ...PRODUCTION_ENV,
          TRUSTED_APP_ORIGINS: "https://staging.example.com:8443/",
        },
      }
    );

    expect(origin).toBe("https://staging.example.com:8443");
  });

  it("matches wildcard patterns only on a real subdomain boundary", () => {
    expect(
      isTrustedRequestHost("foo.devtunnels.ms", {
        env: { ...PRODUCTION_ENV, TRUSTED_APP_ORIGINS: "*.devtunnels.ms" },
      })
    ).toBe(true);
    expect(
      isTrustedRequestHost("evildevtunnels.ms", {
        env: { ...PRODUCTION_ENV, TRUSTED_APP_ORIGINS: "*.devtunnels.ms" },
      })
    ).toBe(false);
  });
});

describe("runtime vs public origin", () => {
  it("uses the request origin for runtime media on a development tunnel", () => {
    const runtime = resolveRuntimeAppOrigin(
      headers({
        "x-forwarded-host": TUNNEL_HOST,
        "x-forwarded-proto": "https",
      }),
      { env: LOCAL_ENV }
    );

    expect(runtime).toBe(`https://${TUNNEL_HOST}`);
  });

  it("uses the configured canonical origin for public links in production", () => {
    const publicOrigin = resolvePublicAppOrigin(
      headers({
        "x-forwarded-host": TUNNEL_HOST,
        "x-forwarded-proto": "https",
      }),
      { env: PRODUCTION_ENV }
    );

    expect(publicOrigin).toBe("https://invite.example.com");
  });

  it("still prefers the request origin for runtime media in production", () => {
    const runtime = resolveRuntimeAppOrigin(
      headers({ host: "invite.example.com", "x-forwarded-proto": "https" }),
      { env: PRODUCTION_ENV }
    );

    expect(runtime).toBe("https://invite.example.com");
  });

  it("uses the tunnel origin for public links while the configured value is localhost", () => {
    const publicOrigin = resolvePublicAppOrigin(
      headers({
        "x-forwarded-host": TUNNEL_HOST,
        "x-forwarded-proto": "https",
      }),
      { env: LOCAL_ENV }
    );

    expect(publicOrigin).toBe(`https://${TUNNEL_HOST}`);
  });

  it("falls back safely when no trusted origin is available", () => {
    expect(resolveRuntimeAppOrigin(headers({ host: "evil.example.net" }), { env: LOCAL_ENV })).toBe(
      "http://localhost:3000"
    );
    expect(
      resolvePublicAppOrigin(headers({ host: "evil.example.net" }), { env: LOCAL_ENV })
    ).toBe("http://localhost:3000");
  });

  it("uses the configured canonical origin for request-less callers", () => {
    expect(resolveConfiguredAppOrigin({ env: PRODUCTION_ENV })).toBe(
      "https://invite.example.com"
    );
    expect(resolveConfiguredAppOrigin({ env: { NODE_ENV: "test" } })).toBe(LOCAL_APP_ORIGIN);
  });
});
