import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = { counts: 0, inserted: [] as unknown[], providerCalls: 0 };

const supabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      // Mirrors the `.eq(...).eq(...).eq(...).then()` chain used for the
      // pre-send dedupe lookup.
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ count: state.counts })),
        })),
      })),
    })),
    insert: vi.fn((row: unknown) => {
      state.inserted.push(row);
      return Promise.resolve({ error: null });
    }),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => supabase }));
vi.mock("server-only", () => ({}));

import { sendEmail } from "./email";

// restoreMocks:true in vitest.config resets module-scope stubs, so the fetch
// stub has to be reinstalled per test.
function stubResend() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      state.providerCalls++;
      return new Response(JSON.stringify({ id: "msg_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
}

beforeEach(() => {
  state.counts = 0;
  state.inserted = [];
  state.providerCalls = 0;
  stubResend();
  vi.stubEnv("EMAIL_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Invite Lime <test@example.com>");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const email = {
  to: "couple@example.com",
  subject: "Your invitation is ready",
  html: "<p>hi</p>",
  templateKey: "invitation_published",
  weddingId: "w-1",
};

describe("sendEmail dedupe", () => {
  it("sends and records when no prior successful delivery exists", async () => {
    const res = await sendEmail(email, { dedupe: true });
    expect(res.ok).toBe(true);
    expect(state.providerCalls).toBe(1);
    expect(state.inserted).toHaveLength(1);
  });

  it("skips the provider entirely when a sent row already exists", async () => {
    state.counts = 1;
    const res = await sendEmail(email, { dedupe: true });
    expect(res.ok).toBe(true);
    // The regression this guards: dedupe used to run *after* sending, so a
    // repeat publish emailed the couple again despite a sent row existing.
    expect(state.providerCalls).toBe(0);
    expect(state.inserted).toHaveLength(0);
  });

  it("retries after a previous failure, since failures are not deduped", async () => {
    // count reflects only "sent" rows; a failed prior attempt leaves it at 0.
    state.counts = 0;
    await sendEmail(email, { dedupe: true });
    expect(state.providerCalls).toBe(1);
  });

  it("always sends when dedupe is not requested (admin notices)", async () => {
    state.counts = 1;
    await sendEmail({ ...email, to: "admin@example.com", templateKey: "notify_admin_order" });
    expect(state.providerCalls).toBe(1);
    expect(state.inserted).toHaveLength(1);
  });
});