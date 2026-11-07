import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The builder autosaves after every step, so the first save carries only the
 * couple names — no wedding date, no venue. Requiring those here made the very
 * first "Continue" fail its save and surface a misleading "fix the fields
 * above" toast. Drafts must accept whatever the customer has filled so far;
 * the strict `weddingDataSchema` still guards publishing.
 */

const USER_ID = "99999999-9999-4999-8999-999999999999";

const saveBuilderDraft = vi.fn<
  (input: Record<string, unknown>) => Promise<{
    id: string;
    session_id: string;
    wedding_data: Record<string, unknown>;
  }>
>(async () => ({
  id: "draft-1",
  session_id: "session-1",
  wedding_data: {},
}));

const getOwnedBuilderDraft = vi.fn(async () => null as Record<string, unknown> | null);

const syncActiveWeddingFromDraft = vi.fn<
  (input: Record<string, unknown>) => Promise<{
    id: string;
    slug: string;
    data: Record<string, unknown>;
    previousData: Record<string, unknown>;
  } | null>
>(async () => null);

const deleteUnreferencedMediaKeys = vi.fn(async () => ({
  deleted: [],
  kept: [],
  failures: [],
}));

vi.mock("@/lib/services/builder", () => ({
  getOwnedBuilderDraft: (...args: unknown[]) => getOwnedBuilderDraft(...(args as [])),
  saveBuilderDraft: (input: Record<string, unknown>) => saveBuilderDraft(input),
}));

vi.mock("@/lib/services/guest-wedding", () => ({
  syncActiveWeddingFromDraft: (input: Record<string, unknown>) =>
    syncActiveWeddingFromDraft(input),
}));

vi.mock("@/lib/services/media-cleanup", () => ({
  deleteUnreferencedMediaKeys: (...args: unknown[]) =>
    deleteUnreferencedMediaKeys(...(args as [])),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID, email: "meera@example.com" } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: USER_ID, role: "customer" }, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/services/ops", () => ({
  clientKey: () => "test-client",
  consumeRateLimit: async () => ({ allowed: true }),
}));

import { POST } from "./route";

const TOKEN = "builder-token-1234567890";
const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";

function request(body: unknown): Request {
  return new Request("http://localhost/api/builder/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Mirrors `weddingDataForDb`: empty fields are stripped before saving. */
const stepOneData = { brideName: "Meera", groomName: "Aarav" };

describe("POST /api/builder/draft", () => {
  beforeEach(() => {
    saveBuilderDraft.mockClear();
    syncActiveWeddingFromDraft.mockClear();
    getOwnedBuilderDraft.mockReset();
    getOwnedBuilderDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      user_id: USER_ID,
      wedding_data: {},
    });
    deleteUnreferencedMediaKeys.mockClear();
    syncActiveWeddingFromDraft.mockResolvedValue(null);
  });

  it("saves a step-one draft that has no date or venue yet", async () => {
    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: stepOneData,
      email: null,
    }));

    expect(res.status).toBe(200);
    expect(saveBuilderDraft).toHaveBeenCalledTimes(1);
    expect(saveBuilderDraft.mock.calls[0][0]).toMatchObject({
      token: TOKEN,
      userId: USER_ID,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: stepOneData,
    });
  });

  it("rejects a draft that belongs to another account", async () => {
    getOwnedBuilderDraft.mockResolvedValue(null);

    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: stepOneData,
    }));

    expect(res.status).toBe(403);
    expect(saveBuilderDraft).not.toHaveBeenCalled();
  });

  it("mirrors a save onto the session's published invitation", async () => {
    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: stepOneData,
      email: null,
    }));

    expect(res.status).toBe(200);
    expect(syncActiveWeddingFromDraft).toHaveBeenCalledWith({
      sessionId: "session-1",
      draftId: "draft-1",
      weddingData: stepOneData,
    });
  });

  it("offers media from the previous draft to the reference-aware cleanup", async () => {
    const oldKey = "0123456789abcdef-4-42/gallery/gallery-old.webp";
    getOwnedBuilderDraft.mockResolvedValue({
      id: "draft-1",
      session_id: "session-1",
      user_id: USER_ID,
      wedding_data: {
        gallery: [{ role: "gallery", url: `/api/media/${oldKey}`, name: "old.webp" }],
      },
    });

    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: { ...stepOneData, gallery: [] },
      email: null,
    }));

    expect(res.status).toBe(200);
    expect(deleteUnreferencedMediaKeys).toHaveBeenCalledWith(
      [oldKey],
      expect.objectContaining({
        weddingId: null,
        guestSessionId: "session-1",
        draftId: "draft-1",
        includeStaleWeddingMedia: false,
      })
    );
  });

  it("includes the live invitation's previous media when it is mirrored", async () => {
    const liveId = "33333333-3333-4333-8333-333333333333";
    const oldKey = `${liveId}/groom/groom-old.webp`;
    syncActiveWeddingFromDraft.mockResolvedValue({
      id: liveId,
      slug: "meera-aarav",
      data: {},
      previousData: {
        groomPhoto: `/api/media/${oldKey}`,
      },
    });

    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: stepOneData,
      email: null,
    }));

    expect(res.status).toBe(200);
    expect(deleteUnreferencedMediaKeys).toHaveBeenCalledWith(
      [oldKey],
      expect.objectContaining({
        weddingId: liveId,
        includeStaleWeddingMedia: true,
      })
    );
  });

  it("saves a step-two draft with an unnamed ceremony and a half-typed maps link", async () => {
    // Exactly what the builder sends after "Add event" plus a partially typed
    // Google Maps link — both were rejected by the strict schema.
    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: {
        brideName: "Meera",
        groomName: "Aarav",
        weddingDate: "2027-02-14",
        venue: "Palace Gardens",
        mapsUrl: "https://maps.app.goo.gl/",
        events: [
          { name: "Mehendi & Haldi", date: "2027-02-12" },
          { name: "" },
        ],
      },
    }));

    expect(res.status).toBe(200);
    expect(saveBuilderDraft).toHaveBeenCalledTimes(1);
  });

  it("still enforces per-field limits on the fields that are present", async () => {
    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      // 121 chars — over the 120-char name limit.
      weddingData: { brideName: "M".repeat(121), groomName: "Aarav" },
    }));

    expect(res.status).toBe(400);
    expect(saveBuilderDraft).not.toHaveBeenCalled();
  });

  it("still bounds collection sizes", async () => {
    const res = await POST(request({
      token: TOKEN,
      templateId: TEMPLATE_ID,
      templateVersionId: VERSION_ID,
      weddingData: {
        brideName: "Meera",
        groomName: "Aarav",
        events: Array.from({ length: 13 }, () => ({ name: "Reception" })),
      },
    }));

    expect(res.status).toBe(400);
    expect(saveBuilderDraft).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid template id", async () => {
    const res = await POST(request({
      token: TOKEN,
      templateId: "not-a-uuid",
      templateVersionId: VERSION_ID,
      weddingData: stepOneData,
    }));

    expect(res.status).toBe(400);
    expect(saveBuilderDraft).not.toHaveBeenCalled();
  });
});
