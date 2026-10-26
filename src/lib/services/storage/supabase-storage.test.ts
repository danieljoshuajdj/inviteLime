import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Entry {
  name: string;
  /** Supabase reports folders as entries with a null id. */
  id: string | null;
}

const tree = new Map<string, Entry[]>();

const list = vi.fn(async (bucket: string, directory: string) => ({
  data: tree.get(`${bucket}:${directory}`) ?? [],
  error: null as { message: string; status?: number } | null,
}));

const admin = {
  storage: {
    from: (bucket: string) => ({
      list: (directory: string) => list(bucket, directory),
    }),
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

import { createSupabaseStorage } from "./supabase-storage";

beforeEach(() => {
  tree.clear();
  list.mockClear();
});

describe("SupabaseStorage.list", () => {
  it("walks nested folders so every object under a prefix is found", async () => {
    // The wedding bucket is nested: uuid/role/file, and a template bucket adds
    // version folders on top. A single-level list would find none of these and
    // every prefix "delete" would silently do nothing.
    tree.set("weddings:wed-1/", [
      { name: "meta.json", id: "f1" },
      { name: "bride", id: null },
      { name: "gallery", id: null },
    ]);
    tree.set("weddings:wed-1/bride/", [{ name: "bride-1.webp", id: "f2" }]);
    tree.set("weddings:wed-1/gallery/", [{ name: "2026", id: null }]);
    tree.set("weddings:wed-1/gallery/2026/", [{ name: "gallery-1.webp", id: "f3" }]);

    const storage = createSupabaseStorage();
    const keys = await storage.list("weddings", "wed-1/");

    expect(keys.sort()).toEqual([
      "wed-1/bride/bride-1.webp",
      "wed-1/gallery/2026/gallery-1.webp",
      "wed-1/meta.json",
    ]);
  });

  it("lists the bucket root when the prefix is empty", async () => {
    tree.set("weddings:", [
      { name: "top.webp", id: "f0" },
      { name: "folder", id: null },
    ]);
    tree.set("weddings:folder/", [{ name: "nested.webp", id: "f1" }]);

    const storage = createSupabaseStorage();
    const keys = await storage.list("weddings", "");

    expect(keys.sort()).toEqual(["folder/nested.webp", "top.webp"]);
  });

  it("surfaces a listing error instead of returning a partial list", async () => {
    list.mockResolvedValueOnce({
      data: null,
      error: { message: "boom", status: 500 },
    } as never);

    const storage = createSupabaseStorage();

    await expect(storage.list("weddings", "wed-1/")).rejects.toThrow("boom");
  });
});
