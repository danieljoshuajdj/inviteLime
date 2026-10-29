import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "user-1";
const WEDDING_ID = "11111111-1111-4111-8111-111111111111";

interface WeddingRow {
  id: string;
  user_id: string;
  bride_name: string;
  groom_name: string;
  wedding_date: string;
  wedding_time: string | null;
  venue: string;
  address: string | null;
  maps_url: string | null;
  rsvp_toggle: boolean;
  status: string;
  slug: string;
  guest_session_id?: string | null;
  wedding_data: Record<string, unknown>;
}

interface FakeState {
  wedding: WeddingRow | null;
  update: Record<string, unknown> | null;
  profileRole: string;
}

const state: FakeState = {
  wedding: null,
  update: null,
  profileRole: "planner",
};

class FakeQuery {
  constructor(private readonly table: string) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  update(values: Record<string, unknown>) {
    state.update = values;
    return { eq: async () => ({ error: null }) };
  }
  async maybeSingle() {
    if (this.table === "profiles") {
      return { data: { role: state.profileRole }, error: null };
    }
    return { data: state.wedding, error: null };
  }
}

const purgeWedding = vi.fn(async () => ({
  alreadyDeleted: false,
  weddingId: WEDDING_ID,
  slug: "bride-and-groom",
  email: null,
  couple: "Groom & Bride",
  previousStatus: "active",
  objectsDeleted: 3,
  prefixes: [],
}));
const consumeRateLimit = vi.fn(async () => ({ allowed: true }));
const deleteUnreferencedMediaKeys = vi.fn(async () => ({
  deleted: [],
  kept: [],
  failures: [],
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from: (table: string) => new FakeQuery(table),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/services/ops", () => ({
  consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...(args as [])),
}));
vi.mock("@/lib/services/wedding-purge", () => ({
  purgeWedding: (...args: unknown[]) => purgeWedding(...(args as [])),
  WeddingPurgeError: class extends Error {
    step = "database" as const;
    objectsDeleted = 0;
    failures: Array<{ key: string; detail: string }> = [];
  },
}));
vi.mock("@/lib/services/media-cleanup", () => ({
  deleteUnreferencedMediaKeys: (...args: unknown[]) =>
    deleteUnreferencedMediaKeys(...(args as [])),
}));

const media = {
  bridePhoto: "/api/media/wedding/bride/bride.webp",
  groomPhoto: "/api/media/wedding/groom/groom.webp",
  couplePhoto: "/api/media/wedding/couple/couple.webp",
  gallery: [{ role: "gallery", url: "/api/media/wedding/gallery/one.webp", name: "one.webp" }],
  music: { role: "music", url: "/api/media/wedding/music/track.mp3", name: "track.mp3" },
};

function routeContext() {
  return { params: Promise.resolve({ id: WEDDING_ID }) };
}

function seedWedding() {
  state.wedding = {
    id: WEDDING_ID,
    user_id: USER_ID,
    bride_name: "Bride",
    groom_name: "Groom",
    wedding_date: "2026-12-12",
    wedding_time: "18:00",
    venue: "The Hall",
    address: "",
    maps_url: null,
    rsvp_toggle: true,
    status: "active",
    slug: "bride-and-groom",
    guest_session_id: null,
    wedding_data: {
      ...media,
      // Legacy rows can contain null here; the editor must receive a safe
      // value rather than a controlled input warning.
      mapsUrl: null,
      weddingTime: null,
    },
  };
}

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("./route");
  return PATCH(
    new Request(`http://localhost/api/weddings/${WEDDING_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    routeContext()
  );
}

async function remove(body: Record<string, unknown> = { confirm: "bride-and-groom" }) {
  const { DELETE } = await import("./route");
  return DELETE(
    new Request(`http://localhost/api/weddings/${WEDDING_ID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    routeContext()
  );
}

describe("/api/weddings/[id] media", () => {
  beforeEach(() => {
    state.update = null;
    state.profileRole = "planner";
    seedWedding();
    deleteUnreferencedMediaKeys.mockClear();
    deleteUnreferencedMediaKeys.mockResolvedValue({ deleted: [], kept: [], failures: [] });
  });

  it("returns photos, gallery and music for the account editor", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request(`http://localhost/api/weddings/${WEDDING_ID}`),
      routeContext()
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.gallery).toEqual(media.gallery);
    expect(json.bridePhoto).toBe(media.bridePhoto);
    expect(json.groomPhoto).toBe(media.groomPhoto);
    expect(json.couplePhoto).toBe(media.couplePhoto);
    expect(json.music).toEqual(media.music);
    expect(json.mapsUrl).toBeNull();
    expect(json.weddingTime).toBe("18:00");
  });

  it("persists photo, gallery and music edits into wedding_data", async () => {
    const res = await patch({
      brideName: "Bride",
      groomName: "Groom",
      dress: null,
      weddingDate: "2026-12-12",
      weddingTime: "18:00",
      venue: "The Hall",
      address: "",
      mapsUrl: null,
      events: [],
      ...media,
    });

    expect(res.status).toBe(200);
    const stored = (state.update?.wedding_data ?? {}) as Record<string, unknown>;
    expect(stored.gallery).toEqual(media.gallery);
    expect(stored.bridePhoto).toBe(media.bridePhoto);
    expect(stored.groomPhoto).toBe(media.groomPhoto);
    expect(stored.couplePhoto).toBe(media.couplePhoto);
    expect(stored.music).toEqual(media.music);
  });

  it("clears a removed soundtrack or gallery instead of keeping stale rows", async () => {
    const res = await patch({
      brideName: "Bride",
      groomName: "Groom",
      dress: null,
      weddingDate: "2026-12-12",
      weddingTime: "18:00",
      venue: "The Hall",
      address: "",
      mapsUrl: null,
      events: [],
      gallery: [],
      bridePhoto: null,
      groomPhoto: null,
      couplePhoto: null,
      music: null,
    });

    expect(res.status).toBe(200);
    const stored = (state.update?.wedding_data ?? {}) as Record<string, unknown>;
    expect(stored.gallery).toEqual([]);
    expect(stored.bridePhoto).toBeNull();
    expect(stored.groomPhoto).toBeNull();
    expect(stored.couplePhoto).toBeNull();
    expect(stored.music).toBeNull();

    expect(deleteUnreferencedMediaKeys).toHaveBeenCalledWith(
      [
        "wedding/bride/bride.webp",
        "wedding/groom/groom.webp",
        "wedding/couple/couple.webp",
        "wedding/gallery/one.webp",
        "wedding/music/track.mp3",
      ],
      expect.objectContaining({
        weddingId: WEDDING_ID,
        includeStaleWeddingMedia: true,
      })
    );
  });
});

describe("/api/weddings/[id] planner delete", () => {
  beforeEach(() => {
    state.profileRole = "planner";
    state.update = null;
    seedWedding();
    purgeWedding.mockClear();
    consumeRateLimit.mockClear();
    consumeRateLimit.mockResolvedValue({ allowed: true });
  });

  it("lets a planner permanently delete their own invitation", async () => {
    const res = await remove();

    expect(res.status).toBe(200);
    expect(purgeWedding).toHaveBeenCalledWith(
      expect.anything(),
      WEDDING_ID,
      expect.objectContaining({
        actorId: USER_ID,
        auditAction: "invitation.delete",
        auditMetadata: { trigger: "planner" },
      })
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.objectsDeleted).toBe(3);
  });

  it("rejects customers", async () => {
    state.profileRole = "customer";
    const res = await remove();
    expect(res.status).toBe(403);
    expect(purgeWedding).not.toHaveBeenCalled();
  });

  it("rejects an invitation owned by somebody else", async () => {
    state.wedding = null;
    const res = await remove();
    expect(res.status).toBe(404);
    expect(purgeWedding).not.toHaveBeenCalled();
  });

  it("requires the confirmation value to match the invitation", async () => {
    const res = await remove({ confirm: "wrong-slug" });
    expect(res.status).toBe(400);
    expect(purgeWedding).not.toHaveBeenCalled();
  });
});
