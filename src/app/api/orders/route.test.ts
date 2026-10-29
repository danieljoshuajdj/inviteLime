import { beforeEach, describe, expect, it, vi } from "vitest";

const TPL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRODUCT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

class Q {
  constructor(private table: string) {}
  private unwrapSingle = false;
  private filters: Array<{ col: string; val: unknown }> = [];
  private inserted = false;
  select() {
    return this;
  }
  update() {
    return this;
  }
  insert(values: Record<string, unknown>) {
    db.inserts.push({ table: this.table, values });
    this.inserted = true;
    return this;
  }
  delete() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }
  in() {
    return this;
  }
  single() {
    if (this.inserted) return Promise.resolve({ data: { id: "order_plan" }, error: null });
    this.unwrapSingle = true;
    return this.resolve();
  }
  maybeSingle() {
    this.unwrapSingle = true;
    return this.resolve();
  }
  then<T>(cb: (v: unknown) => unknown): Promise<T> {
    const result = this.inserted ? { data: null, error: null } : this.resolve();
    return Promise.resolve(result).then(cb as never) as Promise<T>;
  }
  private resolve() {
    const res = db.rows[this.table] ?? { data: null, error: null };
    let data = res.data;
    if (Array.isArray(data) && this.filters.length > 0) {
      data = data.filter((row) => this.filters.every((f) => (row as Record<string, unknown>)[f.col] === f.val));
    }
    const filtered = { ...res, data };
    if (this.unwrapSingle && Array.isArray(filtered.data)) {
      return { data: filtered.data[0] ?? null, error: filtered.error };
    }
    return filtered;
  }
}

const db = {
  rows: {} as Record<string, { data: unknown; error: { code?: string } | null }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  from(table: string) {
    return new Q(table);
  },
};

const getGuestDraft = vi.fn();
const createDraftWedding = vi.fn();
const createRazorpayOrder = vi.fn();
const consumeRateLimit = vi.fn(async () => ({ allowed: true }));
const clientKey = vi.fn(() => "test-ip");
const getCurrentProfile = vi.fn();
const getPlannerEntitlement = vi.fn();
const getPlannerBrand = vi.fn();
const claimPlannerInvitationSlot = vi.fn();
const releasePlannerInvitationSlot = vi.fn();
const finalizePaidWedding = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("@/lib/services/guest", () => ({
  getGuestDraft: (supabase: unknown, token: string) => getGuestDraft(supabase, token),
  guestTokenFromCookies: () => "",
}));
vi.mock("@/lib/services/payments", () => ({
  createRazorpayOrder: (...a: unknown[]) => createRazorpayOrder(...(a as [])),
}));
vi.mock("@/lib/services/weddings", () => ({
  createDraftWedding: (...a: unknown[]) => createDraftWedding(...(a as [])),
  invitationUrl: (slug: string) => `https://invite.test/w/${slug}`,
}));
vi.mock("@/lib/services/ops", () => ({
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...(a as [])),
  clientKey: (...a: unknown[]) => clientKey(...(a as [])),
}));
vi.mock("@/lib/services/helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/helpers")>();
  return {
    ...actual,
    getCurrentProfile: (...a: unknown[]) => getCurrentProfile(...(a as [])),
  };
});
vi.mock("@/lib/services/planner-plans", () => ({
  getPlannerEntitlement: (...a: unknown[]) => getPlannerEntitlement(...(a as [])),
  claimPlannerInvitationSlot: (...a: unknown[]) => claimPlannerInvitationSlot(...(a as [])),
  releasePlannerInvitationSlot: (...a: unknown[]) => releasePlannerInvitationSlot(...(a as [])),
}));
vi.mock("@/lib/services/planner-branding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/planner-branding")>();
  return {
    ...actual,
    getPlannerBrand: (...a: unknown[]) => getPlannerBrand(...(a as [])),
  };
});
vi.mock("@/lib/services/finalize-purchase", () => ({
  finalizePaidWedding: (...a: unknown[]) => finalizePaidWedding(...(a as [])),
}));

beforeEach(() => {
  db.rows = {};
  db.inserts = [];
  createDraftWedding.mockReset().mockResolvedValue({ id: "wedding-1" });
  createRazorpayOrder.mockReset().mockResolvedValue({ id: "order_rzp" });
  consumeRateLimit.mockReset().mockResolvedValue({ allowed: true });
  getGuestDraft.mockReset().mockResolvedValue({
    id: "draft-1",
    session_id: "session-1",
    wedding_data: { venue: "The Grand Palace" },
  });
  getCurrentProfile.mockReset().mockResolvedValue({
    user: { id: "planner-1" },
    profile: { id: "planner-1", role: "planner" },
  });
  getPlannerEntitlement.mockReset();
  getPlannerBrand.mockReset();
  claimPlannerInvitationSlot.mockReset();
  releasePlannerInvitationSlot.mockReset().mockResolvedValue(undefined);
  finalizePaidWedding.mockReset().mockResolvedValue({
    published: { slug: "aisha-weds-rahul", id: "wedding-1" },
  });
});

async function run(body: unknown, extraHeaders: Record<string, string> = {}) {
  const { POST } = await import("./route");
  const req = new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  return POST(req);
}

function payload() {
  return {
    templateId: TPL,
    templateVersionId: VER,
    brideName: "Aisha",
    groomName: "Rahul",
    weddingDate: "2026-02-14",
    email: "aisha@example.com",
    token: "secret-token",
  };
}

function plannerEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    canCreate: true,
    reason: "ready",
    plan: { id: "plan-1", name: "Atelier" },
    subscription: { id: "sub-1", status: "active" },
    limit: null,
    used: 0,
    remaining: null,
    ...overrides,
  };
}

function seedPublished(templateStatus = "active", formType = "wedding") {
  db.rows.template_versions = { data: [{ id: VER, template_id: TPL, status: "published" }], error: null };
  db.rows.templates = {
    data: [{ id: TPL, product_id: PRODUCT, status: templateStatus, form_type: formType }],
    error: null,
  };
  db.rows.products = { data: [{ id: PRODUCT, price_paise: 149900, currency: "INR" }], error: null };
}

describe("POST /api/orders (purchase availability)", () => {
  it("rejects a disabled template, even with a valid version and draft", async () => {
    seedPublished("disabled");
    const res = await run(payload());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no longer available/);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
    expect(createDraftWedding).not.toHaveBeenCalled();
    expect(db.inserts.filter((i) => i.table === "orders")).toHaveLength(0);
  });

  it("rejects a draft (unpublished) version", async () => {
    seedPublished("active");
    db.rows.template_versions = { data: [], error: null };
    const res = await run(payload());
    expect(res.status).toBe(400);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it("allows a purchase when the template is active again (re-enable reinstates purchase)", async () => {
    seedPublished("active");
    const res = await run(payload());
    expect(res.status).toBe(200);
    expect(createDraftWedding).toHaveBeenCalledTimes(1);
    expect(createRazorpayOrder).toHaveBeenCalledTimes(1);
    const order = db.inserts.find((i) => i.table === "orders");
    expect(order?.values.template_id).toBe(TPL);
    expect(order?.values.template_version_id).toBe(VER);
  });

  it("prices and charges in the visitor's detected currency", async () => {
    seedPublished("active");
    db.rows.products = {
      data: [
        {
          id: PRODUCT,
          price_paise: 149900,
          currency: "INR",
          prices: [
            { currency: "USD", amount_minor: 1900, active: true },
            { currency: "EUR", amount_minor: 1800, active: true },
          ],
        },
      ],
      error: null,
    };

    const res = await run(payload(), { "cf-ipcountry": "US" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { amountPaise: number; currency: string };
    expect(body).toMatchObject({ amountPaise: 1900, currency: "USD" });
    expect(createRazorpayOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: 1900, currency: "USD" })
    );

    const order = db.inserts.find((i) => i.table === "orders");
    expect(order?.values.amount_paise).toBe(1900);
    expect(order?.values.currency).toBe("USD");
  });

  it("falls back to the home-market price when the country cannot be resolved", async () => {
    seedPublished("active");
    const res = await run(payload());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { amountPaise: number; currency: string };
    expect(body).toMatchObject({ amountPaise: 149900, currency: "INR" });
  });
});

describe("POST /api/orders (event forms)", () => {
  it("keeps the wedding payload for an engagement template", async () => {
    seedPublished("active", "engagement");
    const res = await run(payload());
    expect(res.status).toBe(200);
    expect(createDraftWedding).toHaveBeenCalledWith(
      expect.objectContaining({
        formType: "engagement",
        brideName: "Aisha",
        groomName: "Rahul",
      })
    );
  });

  it("derives the birthday wishes form and sends the celebrant", async () => {
    seedPublished("active", "birthday_wishes");
    getGuestDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      wedding_data: {
        celebrantName: "Ananya",
        birthdayNumber: 21,
        specialMessage: "Happy birthday!",
      },
    });

    const res = await run({
      templateId: TPL,
      templateVersionId: VER,
      celebrantName: "Ananya",
      email: "aisha@example.com",
      token: "secret-token",
    });

    expect(res.status).toBe(200);
    expect(createDraftWedding).toHaveBeenCalledWith(
      expect.objectContaining({
        formType: "birthday_wishes",
        celebrantName: "Ananya",
        brideName: undefined,
        groomName: undefined,
        weddingDate: undefined,
      })
    );
  });

  it("rejects a birthday celebration without a venue", async () => {
    seedPublished("active", "birthday_celebration");
    getGuestDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      wedding_data: { celebrantName: "Ananya" },
    });

    const res = await run({
      templateId: TPL,
      templateVersionId: VER,
      celebrantName: "Ananya",
      weddingDate: "2027-02-14",
      email: "aisha@example.com",
      token: "secret-token",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/Celebration date and venue/);
    expect(createDraftWedding).not.toHaveBeenCalled();
  });

  it("rejects birthday wishes without a message", async () => {
    seedPublished("active", "birthday_wishes");
    getGuestDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      wedding_data: { celebrantName: "Ananya", birthdayNumber: 21 },
    });

    const res = await run({
      templateId: TPL,
      templateVersionId: VER,
      celebrantName: "Ananya",
      email: "aisha@example.com",
      token: "secret-token",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/special message/i);
    expect(createDraftWedding).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders (publish email)", () => {
  it("rejects a guest checkout without an email", async () => {
    seedPublished("active");
    getCurrentProfile.mockResolvedValue(null);

    const res = await run({ ...payload(), email: null });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/email/i);
    expect(createDraftWedding).not.toHaveBeenCalled();
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it("uses the account email when a signed-in owner leaves the field empty", async () => {
    seedPublished("active");
    getCurrentProfile.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      profile: null,
    });

    const res = await run({ ...payload(), email: null });
    expect(res.status).toBe(200);
    expect(createDraftWedding).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@example.com" })
    );
  });

  it("accepts the email a guest enters", async () => {
    seedPublished("active");
    getCurrentProfile.mockResolvedValue(null);

    const res = await run({ ...payload(), email: "guest@example.com" });
    expect(res.status).toBe(200);
    expect(createDraftWedding).toHaveBeenCalledWith(
      expect.objectContaining({ email: "guest@example.com" })
    );
  });
});

describe("POST /api/orders (planner plans)", () => {
  it("publishes under the plan without Razorpay when the plan is live and branded", async () => {
    seedPublished("active");
    getGuestDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      wedding_data: { brideName: "Aisha", venue: "The Grand Palace" },
      planner_id: "planner-1",
    });
    getPlannerEntitlement.mockResolvedValue(plannerEntitlement());
    getPlannerBrand.mockResolvedValue({
      profileId: "planner-1",
      brandName: "Rose & Ink",
      contactPhone: "+91 98765 43210",
      address: null,
      mapsUrl: null,
      updatedAt: null,
    });
    claimPlannerInvitationSlot.mockResolvedValue(true);

    const res = await run(payload());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { coveredByPlan?: boolean; amountPaise?: number };
    expect(body.coveredByPlan).toBe(true);
    expect(body.amountPaise).toBe(0);
    expect(claimPlannerInvitationSlot).toHaveBeenCalledWith("sub-1", "planner-1");
    expect(createRazorpayOrder).not.toHaveBeenCalled();
    expect(createDraftWedding).toHaveBeenCalledWith(
      expect.objectContaining({
        plannerId: "planner-1",
        plannerSubscriptionId: "sub-1",
        userId: "planner-1",
        billingSource: "planner_plan",
      })
    );
    const order = db.inserts.find((i) => i.table === "orders");
    expect(order?.values).toMatchObject({
      provider: "planner_plan",
      amount_paise: 0,
      status: "paid",
      planner_subscription_id: "sub-1",
    });
    expect(finalizePaidWedding).toHaveBeenCalledWith(
      expect.objectContaining({ weddingId: "wedding-1", source: "planner_plan" })
    );
    expect(releasePlannerInvitationSlot).not.toHaveBeenCalled();
  });

  it("falls back to a one-time purchase when the plan has lapsed", async () => {
    seedPublished("active");
    getGuestDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      wedding_data: { venue: "The Grand Palace" },
      planner_id: "planner-1",
    });
    getPlannerEntitlement.mockResolvedValue(
      plannerEntitlement({ active: false, canCreate: false, reason: "expired", subscription: null })
    );
    getPlannerBrand.mockResolvedValue(null);

    const res = await run(payload());
    expect(res.status).toBe(200);
    expect(claimPlannerInvitationSlot).not.toHaveBeenCalled();
    expect(createDraftWedding).toHaveBeenCalledWith(
      expect.objectContaining({
        plannerId: null,
        plannerSubscriptionId: null,
        userId: "planner-1",
        billingSource: "one_time",
      })
    );
    expect(createRazorpayOrder).toHaveBeenCalledTimes(1);
    const order = db.inserts.find((i) => i.table === "orders");
    expect(order?.values).toMatchObject({
      provider: "razorpay",
      amount_paise: 149900,
      status: "pending",
    });
  });

  it("falls back to one-time when the studio brand is incomplete", async () => {
    seedPublished("active");
    getGuestDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      wedding_data: { venue: "The Grand Palace" },
      planner_id: "planner-1",
    });
    getPlannerEntitlement.mockResolvedValue(plannerEntitlement());
    getPlannerBrand.mockResolvedValue({
      profileId: "planner-1",
      brandName: "Rose & Ink",
      contactPhone: "",
      address: null,
      mapsUrl: null,
      updatedAt: null,
    });

    const res = await run(payload());
    expect(res.status).toBe(200);
    expect(claimPlannerInvitationSlot).not.toHaveBeenCalled();
    expect(createDraftWedding).toHaveBeenCalledWith(
      expect.objectContaining({ plannerId: null, billingSource: "one_time" })
    );
    expect(createRazorpayOrder).toHaveBeenCalledTimes(1);
  });
});