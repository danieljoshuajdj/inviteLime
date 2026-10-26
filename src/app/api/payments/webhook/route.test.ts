import { createHmac } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webhook is the authoritative payment path: a customer (or Razorpay) can
 * reach it without ever opening the app, and the browser-driven /verify route
 * can be skipped entirely. So the amount the platform *recorded* as owed has to
 * be checked against the amount that was captured, and a missing order row has
 * to stop the payment rather than skip the comparison.
 */

const WEBHOOK_SECRET = "test_webhook_secret";

const publishWedding = vi.fn(async () => ({
  email: null,
  slug: "aisha-and-rahul",
  bride_name: "Aisha",
  groom_name: "Rahul",
  wedding_date: "2026-02-14",
  expiration_date: "2027-02-14",
}));
const recordEvent = vi.fn(async () => {});
const linkInvitationToCustomer = vi.fn(async () => ({ linked: true, reason: null }));
const sendEmail = vi.fn(async () => {});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("@/lib/services/weddings", () => ({
  publishWedding: (...args: unknown[]) => publishWedding(...(args as [])),
  invitationUrl: (slug: string) => `https://invite-lime.example/w/${slug}`,
}));
vi.mock("@/lib/services/analytics", () => ({ recordEvent: (...a: unknown[]) => recordEvent(...(a as [])) }));
vi.mock("@/lib/services/account-linking", () => ({
  linkInvitationToCustomer: (...a: unknown[]) => linkInvitationToCustomer(...(a as [])),
}));
vi.mock("@/lib/services/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...(a as [])),
  renderInvitationPublishedEmail: () => ({ subject: "s", html: "h", text: "t" }),
}));

interface Result {
  data: unknown;
  error: { code?: string } | null;
}

/** Chainable stand-in for the Supabase query builder. */
class FakeQuery {
  private op: "select" | "update" | "insert";

  constructor(
    private readonly table: string,
    op: "select" | "update" | "insert" = "select"
  ) {
    this.op = op;
  }

  select() {
    this.op = "select";
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    db.updates.push({ table: this.table, values });
    return this;
  }
  insert(values: Record<string, unknown>) {
    this.op = "insert";
    db.inserts.push({ table: this.table, values });
    return this;
  }
  eq() {
    return this;
  }
  maybeSingle(): Promise<Result> {
    return Promise.resolve(db.results[this.table] ?? { data: null, error: null });
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(db.results[this.table] ?? { data: null, error: null }).then(onfulfilled);
  }
}

const db = {
  results: {} as Record<string, Result>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  from(table: string) {
    return new FakeQuery(table, "select");
  },
};

const WEDDING_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    wedding_id: WEDDING_ID,
    amount_paise: 2000000,
    currency: "INR",
    status: "pending",
    ...overrides,
  };
}

function post(body: unknown, signature?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig =
    signature ??
    createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return new Request("http://localhost/api/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-razorpay-signature": sig },
    body: raw,
  });
}

function captured(overrides: Record<string, unknown> = {}) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_123",
          order_id: "order_123",
          amount: 2000000,
          currency: "INR",
          status: "captured",
          notes: { wedding_id: WEDDING_ID },
          ...overrides,
        },
      },
    },
  };
}

beforeAll(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
});
afterAll(() => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

beforeEach(() => {
  db.results = { orders: { data: orderRow(), error: null }, payments: { data: null, error: null } };
  db.updates = [];
  db.inserts = [];
  publishWedding.mockClear();
  recordEvent.mockClear();
  linkInvitationToCustomer.mockClear();
  sendEmail.mockClear();
});

async function run(body: unknown, signature?: string) {
  const { POST } = await import("./route");
  return POST(post(body, signature));
}

describe("payment webhook reconciliation", () => {
  it("publishes when the captured amount matches the order", async () => {
    const res = await run(captured());
    expect(res.status).toBe(200);
    expect(publishWedding).toHaveBeenCalledWith(WEDDING_ID);
    const payment = db.inserts.find((i) => i.table === "payments");
    expect(payment?.values.amount_paise).toBe(2000000);
  });

  it("rejects an underpayment", async () => {
    const res = await run(captured({ amount: 1 }));
    expect(res.status).toBe(409);
    expect(publishWedding).not.toHaveBeenCalled();
  });

  it("rejects an unknown order instead of skipping the amount check", async () => {
    // The regression: a missing order row used to bypass reconciliation and
    // publish whatever the payment's notes claimed.
    db.results.orders = { data: null, error: null };
    const res = await run(captured({ amount: 1 }));
    expect(res.status).toBe(409);
    expect(publishWedding).not.toHaveBeenCalled();
    expect(db.inserts.filter((i) => i.table === "payments")).toHaveLength(0);
  });

  it("rejects a matching amount in the wrong currency", async () => {
    const res = await run(captured({ currency: "USD" }));
    expect(res.status).toBe(409);
    expect(publishWedding).not.toHaveBeenCalled();
  });

  it("rejects notes that point at a different wedding than the order", async () => {
    const res = await run(
      captured({ notes: { wedding_id: "9f2504e0-4f89-41d3-9a0c-0305e82c3301" } })
    );
    expect(res.status).toBe(409);
    expect(publishWedding).not.toHaveBeenCalled();
  });

  it("rejects a payment with no id, since it cannot be deduplicated", async () => {
    const res = await run(captured({ id: undefined }));
    expect(res.status).toBe(400);
    expect(publishWedding).not.toHaveBeenCalled();
  });

  it("rejects an unsigned or tampered delivery", async () => {
    const res = await run(captured(), "deadbeef");
    expect(res.status).toBe(403);
    expect(publishWedding).not.toHaveBeenCalled();
  });

  it("does not record a second payment on replay", async () => {
    db.results.payments = { data: { id: "pay_existing" }, error: null };
    const res = await run(captured());
    expect(res.status).toBe(200);
    expect(db.inserts.filter((i) => i.table === "payments")).toHaveLength(0);
  });

  it("tolerates a concurrent delivery losing the unique-index race", async () => {
    db.results.payments = { data: null, error: null };
    db.results.payments = { data: null, error: { code: "23505" } };
    const res = await run(captured());
    expect(res.status).toBe(200);
  });

  it("marks a failed payment without publishing", async () => {
    const res = await run({
      event: "payment.failed",
      payload: { payment: { entity: { order_id: "order_123" } } },
    });
    expect(res.status).toBe(200);
    expect(publishWedding).not.toHaveBeenCalled();
    const update = db.updates.find((u) => u.table === "orders");
    expect(update?.values.status).toBe("failed");
  });

  it("acknowledges events it does not handle", async () => {
    const res = await run({ event: "refund.processed" });
    expect(res.status).toBe(200);
    expect(publishWedding).not.toHaveBeenCalled();
  });
});
