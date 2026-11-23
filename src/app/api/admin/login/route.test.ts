import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const signOut = vi.fn(async () => ({ error: null }));
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { signInWithPassword, signOut },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

vi.mock("@/lib/services/ops", () => ({
  clientKey: () => "test-ip",
  consumeRateLimit: async () => ({ allowed: true }),
}));

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/login", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signOut.mockClear();
    maybeSingle.mockReset();
  });

  it("rejects a malformed payload", async () => {
    const res = await POST(request({ email: "not-an-email", password: "" }));
    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a generic message for wrong credentials", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new Error("Invalid login credentials"),
    });

    const res = await POST(request({ email: "admin@example.com", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Incorrect email or password.");
  });

  it("denies a valid customer account and clears its session", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: { role: "customer" }, error: null });

    const res = await POST(request({ email: "customer@example.com", password: "secret" }));
    expect(res.status).toBe(403);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("opens the admin dashboard for an admin account", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });

    const res = await POST(
      request({ email: "admin@example.com", password: "secret", next: "/admin/templates" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/admin/templates" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("never redirects outside the admin area", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });

    const res = await POST(
      request({ email: "admin@example.com", password: "secret", next: "//evil.example" })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { redirect: string }).redirect).toBe("/admin/dashboard");
  });
});
