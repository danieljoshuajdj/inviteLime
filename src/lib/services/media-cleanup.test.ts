import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminClient } from "@/lib/supabase/admin";
import type { ObjectStorage } from "./storage";

import { mediaFolderForGuest } from "./media-access";
import { mediaUrlForPath } from "./storage";
import {
  deleteUnreferencedMediaKeys,
  isMediaCleanupAllowed,
  normalizeMediaCleanupKeys,
} from "./media-cleanup";

const WEDDING_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_WEDDING_ID = "99999999-8888-4777-8666-555555555555";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "g".repeat(64);

function future(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

type Row = Record<string, unknown>;

class FakeQuery {
  private readonly filters: Array<(row: Row) => boolean> = [];
  private deleting = false;
  private singleMode = false;

  constructor(
    private readonly table: string,
    private readonly db: FakeDb
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[column]));
    return this;
  }

  gt(column: string, value: string) {
    this.filters.push((row) => String(row[column] ?? "") > value);
    return this;
  }

  maybeSingle() {
    this.singleMode = true;
    return Promise.resolve(this.resolve());
  }

  delete() {
    this.deleting = true;
    return this;
  }

  then<TResult>(
    onfulfilled?: (value: { data: unknown; error: { message: string } | null }) => TResult
  ): Promise<TResult> {
    return Promise.resolve(this.resolve()).then(onfulfilled as never);
  }

  private resolve() {
    const rows = this.db.tables[this.table] ?? [];
    const matched = rows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.deleting) {
      this.db.deleted.push({ table: this.table, rows: matched });
      this.db.tables[this.table] = rows.filter((row) => !matched.includes(row));
      return { data: null, error: this.db.error ? { message: this.db.error } : null };
    }

    if (this.db.error) return { data: null, error: { message: this.db.error } };
    return { data: this.singleMode ? matched[0] ?? null : matched, error: null };
  }
}

class FakeDb {
  tables: Record<string, Row[]> = {};
  deleted: Array<{ table: string; rows: Row[] }> = [];
  error: string | null = null;

  from(table: string) {
    return new FakeQuery(table, this);
  }
}

function adminFor(db: FakeDb): AdminClient {
  return db as unknown as AdminClient;
}

const storage = {
  delete: vi.fn(async () => undefined),
};
const objectStorage = storage as unknown as ObjectStorage;

beforeEach(() => {
  storage.delete.mockReset();
  storage.delete.mockResolvedValue(undefined);
});

describe("normalizeMediaCleanupKeys", () => {
  it("accepts app URLs and plain object keys, de-duplicating them", () => {
    const key = `${WEDDING_ID}/gallery/gallery-a.webp`;
    const keys = normalizeMediaCleanupKeys([
      mediaUrlForPath(key),
      key,
      `${mediaUrlForPath(key)}?sig=abc`,
      null,
      "",
      "https://example.com/photo.jpg",
    ]);

    expect(keys).toEqual([key]);
  });

  it("never returns shared library objects", () => {
    expect(
      normalizeMediaCleanupKeys([
        mediaUrlForPath("library/music/track-abc.mp3"),
        mediaUrlForPath("library/media/photo-abc.webp"),
      ])
    ).toEqual([]);
  });

  it("rejects malformed and traversing keys", () => {
    expect(
      normalizeMediaCleanupKeys([
        "not-a-key",
        "../../etc/passwd",
        `${WEDDING_ID}/gallery/../../secret.webp`,
      ])
    ).toEqual([]);
  });
});

describe("isMediaCleanupAllowed", () => {
  it("authorises only the caller's wedding folder", () => {
    const mine = `${WEDDING_ID}/bride/bride.webp`;
    const theirs = `${OTHER_WEDDING_ID}/bride/bride.webp`;

    expect(isMediaCleanupAllowed(mine, { weddingId: WEDDING_ID })).toBe(true);
    expect(isMediaCleanupAllowed(theirs, { weddingId: WEDDING_ID })).toBe(false);
    expect(isMediaCleanupAllowed(mine, { weddingId: null })).toBe(false);
  });

  it("authorises only draft folders derived from the caller's token", () => {
    const key = `${mediaFolderForGuest(TOKEN, "gallery", 42)}/gallery/gallery-a.webp`;

    expect(isMediaCleanupAllowed(key, { guestToken: TOKEN })).toBe(true);
    expect(isMediaCleanupAllowed(key, { guestToken: `${TOKEN}x` })).toBe(false);
    expect(isMediaCleanupAllowed(key, { guestToken: null })).toBe(false);
  });

  it("refuses library objects", () => {
    const key = "library/media/photo-abc.webp";
    expect(
      isMediaCleanupAllowed(key, { weddingId: WEDDING_ID, guestToken: TOKEN })
    ).toBe(false);
  });
});

describe("deleteUnreferencedMediaKeys", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    db.tables = {
      weddings: [],
      guest_drafts: [],
      wedding_media: [],
    };
  });

  it("deletes an object no live reference points at", async () => {
    const removed = `${WEDDING_ID}/gallery/gallery-removed.webp`;

    const result = await deleteUnreferencedMediaKeys([removed], {
      weddingId: WEDDING_ID,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([removed]);
    expect(result.kept).toEqual([]);
    expect(storage.delete).toHaveBeenCalledWith("weddings", removed);
  });

  it("keeps objects still present in the wedding blob or the draft", async () => {
    const portrait = `${WEDDING_ID}/bride/bride.webp`;
    const gallery = `${WEDDING_ID}/gallery/gallery-live.webp`;
    const draftOnly = `${mediaFolderForGuest(TOKEN, "gallery", 7)}/gallery/gallery-draft.webp`;

    db.tables.weddings = [
      {
        id: WEDDING_ID,
        guest_session_id: SESSION_ID,
        wedding_data: {
          bridePhoto: mediaUrlForPath(portrait),
          gallery: [{ url: mediaUrlForPath(gallery) }],
        },
      },
    ];
    db.tables.guest_drafts = [
      {
        id: "draft-1",
        session_id: SESSION_ID,
        wedding_data: { gallery: [{ url: mediaUrlForPath(draftOnly) }] },
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ];

    const result = await deleteUnreferencedMediaKeys([portrait, gallery, draftOnly], {
      weddingId: WEDDING_ID,
      guestSessionId: SESSION_ID,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([portrait, gallery, draftOnly]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("ignores an expired draft when checking references", async () => {
    const draftKey = `${mediaFolderForGuest(TOKEN, "gallery", 8)}/gallery/gallery-old.webp`;
    db.tables.guest_drafts = [
      {
        id: "draft-old",
        session_id: SESSION_ID,
        wedding_data: { gallery: [{ url: mediaUrlForPath(draftKey) }] },
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ];

    const result = await deleteUnreferencedMediaKeys([draftKey], {
      guestSessionId: SESSION_ID,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([draftKey]);
  });

  it("removes a stale wedding_media row before deleting its object", async () => {
    const stale = `${WEDDING_ID}/groom/groom-old.webp`;
    db.tables.weddings = [
      { id: WEDDING_ID, guest_session_id: null, wedding_data: {} },
    ];
    db.tables.wedding_media = [
      {
        id: "media-1",
        wedding_id: WEDDING_ID,
        storage_key: stale,
        role: "groom",
        created_at: "2020-01-01T00:00:00.000Z",
      },
    ];

    const result = await deleteUnreferencedMediaKeys([], {
      weddingId: WEDDING_ID,
      includeStaleWeddingMedia: true,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([stale]);
    expect(storage.delete).toHaveBeenCalledWith("weddings", stale);
    expect(db.deleted).toContainEqual({
      table: "wedding_media",
      rows: [expect.objectContaining({ id: "media-1" })],
    });
  });

  it("leaves a just-uploaded row alone while its editor is about to save", async () => {
    const fresh = `${WEDDING_ID}/groom/groom-new.webp`;
    db.tables.weddings = [
      { id: WEDDING_ID, guest_session_id: null, wedding_data: {} },
    ];
    db.tables.wedding_media = [
      {
        id: "media-fresh",
        wedding_id: WEDDING_ID,
        storage_key: fresh,
        role: "groom",
        created_at: new Date().toISOString(),
      },
    ];

    const result = await deleteUnreferencedMediaKeys([], {
      weddingId: WEDDING_ID,
      includeStaleWeddingMedia: true,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(db.deleted).toEqual([]);
  });

  it("removes an explicitly named row even inside the grace window", async () => {
    const removed = `${WEDDING_ID}/gallery/gallery-removed.webp`;
    db.tables.weddings = [
      { id: WEDDING_ID, guest_session_id: null, wedding_data: {} },
    ];
    db.tables.wedding_media = [
      {
        id: "media-young",
        wedding_id: WEDDING_ID,
        storage_key: removed,
        role: "gallery",
        created_at: new Date().toISOString(),
      },
    ];

    const result = await deleteUnreferencedMediaKeys([removed], {
      weddingId: WEDDING_ID,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([removed]);
    expect(storage.delete).toHaveBeenCalledWith("weddings", removed);
    expect(db.deleted).toContainEqual({
      table: "wedding_media",
      rows: [expect.objectContaining({ id: "media-young" })],
    });
  });

  it("checks every draft of a session learned only from draftId", async () => {
    const key = `${WEDDING_ID}/gallery/gallery-shared-draft.webp`;
    db.tables.weddings = [
      { id: WEDDING_ID, guest_session_id: null, wedding_data: {} },
    ];
    db.tables.guest_drafts = [
      { id: "draft-1", session_id: SESSION_ID, wedding_data: {}, expires_at: future() },
      {
        id: "draft-2",
        session_id: SESSION_ID,
        wedding_data: { gallery: [{ url: mediaUrlForPath(key) }] },
        expires_at: future(),
      },
    ];

    const result = await deleteUnreferencedMediaKeys([key], {
      weddingId: WEDDING_ID,
      draftId: "draft-1",
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([key]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("does not sweep non-data-backed roles such as video", async () => {
    const video = `${WEDDING_ID}/video/video-a.mp4`;
    db.tables.weddings = [
      { id: WEDDING_ID, guest_session_id: null, wedding_data: {} },
    ];
    db.tables.wedding_media = [
      { id: "video-1", wedding_id: WEDDING_ID, storage_key: video, role: "video" },
    ];

    const result = await deleteUnreferencedMediaKeys([], {
      weddingId: WEDDING_ID,
      includeStaleWeddingMedia: true,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("treats a recorded row on another wedding as a live reference", async () => {
    const key = `${WEDDING_ID}/gallery/gallery-shared.webp`;
    db.tables.weddings = [
      { id: WEDDING_ID, guest_session_id: null, wedding_data: {} },
    ];
    db.tables.wedding_media = [
      { id: "other-row", wedding_id: OTHER_WEDDING_ID, storage_key: key, role: "gallery" },
    ];

    const result = await deleteUnreferencedMediaKeys([key], {
      weddingId: WEDDING_ID,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([key]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("keeps a draft-folder object when no session can verify it", async () => {
    const key = `${mediaFolderForGuest(TOKEN, "bride", 1)}/bride/bride.webp`;

    const result = await deleteUnreferencedMediaKeys([key], {
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([key]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("keeps everything and reports the failure when a reference query fails", async () => {
    const key = `${WEDDING_ID}/bride/bride.webp`;
    db.error = "database unavailable";

    const result = await deleteUnreferencedMediaKeys([key], {
      weddingId: WEDDING_ID,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([key]);
    expect(result.failures[0]).toMatchObject({ key });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("reports a storage failure without dropping the reference row", async () => {
    const key = `${WEDDING_ID}/bride/bride.webp`;
    storage.delete.mockRejectedValueOnce(new Error("B2 unavailable"));

    const result = await deleteUnreferencedMediaKeys([key], {
      weddingId: WEDDING_ID,
      admin: adminFor(db),
      storage: objectStorage,
    });

    expect(result.deleted).toEqual([]);
    expect(result.failures[0]).toMatchObject({
      key,
      detail: "B2 unavailable",
    });
    expect(db.deleted).toEqual([]);
  });
});
