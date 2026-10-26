import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicObjectUrl } from "./urls";
import {
  StorageError,
  isAlreadyExistsError,
  type ObjectStorage,
  type StoredObject,
  type StorageUploadOptions,
} from "./abstraction";

/**
 * Supabase Storage backend. Logical area names ("templates", "weddings") are
 * the physical bucket names — they are created by migrations 00001.
 */
export function createSupabaseStorage(): ObjectStorage {
  return new SupabaseStorage(createAdminClient());
}

/** A single list page is capped at this many entries by the storage API. */
const LIST_PAGE = 1000;

class SupabaseStorage implements ObjectStorage {
  constructor(private readonly admin: AdminClient) {}

  async upload(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array | string,
    options: StorageUploadOptions = {}
  ): Promise<void> {
    const { error } = await this.admin.storage.from(bucket).upload(key, body, {
      contentType: options.contentType,
      upsert: options.upsert ?? false,
      cacheControl: options.cacheControl,
    });
    if (error) throw new StorageError(error.message, error.status);
  }

  async download(bucket: string, key: string): Promise<StoredObject | null> {
    const { data, error } = await this.admin.storage.from(bucket).download(key);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    return { body: Buffer.from(bytes), contentType: data.type || null };
  }

  async delete(bucket: string, key: string): Promise<void> {
    const { error } = await this.admin.storage.from(bucket).remove([key]);
    if (error) throw new StorageError(error.message, error.status);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const segments = key.split("/");
    const file = segments.pop() ?? "";
    if (!file) return false;
    const directory = segments.join("/");
    const { data, error } = await this.admin.storage
      .from(bucket)
      .list(directory, { search: file, limit: 100 });
    if (error) throw new StorageError(error.message, error.status);
    return (data ?? []).some((entry) => entry.name === file);
  }

  async move(bucket: string, source: string, destination: string): Promise<void> {
    const { error } = await this.admin.storage
      .from(bucket)
      .move(source, destination);
    if (error) {
      // Supabase reports the collision as a 409 with "exists" in the message.
      if (isAlreadyExistsError(error)) {
        throw new StorageError(error.message, 409);
      }
      throw new StorageError(error.message, error.status);
    }
  }

  async copy(bucket: string, source: string, destination: string): Promise<void> {
    const { error } = await this.admin.storage
      .from(bucket)
      .copy(source, destination);
    if (error) throw new StorageError(error.message, error.status);
  }

  async list(bucket: string, prefix: string): Promise<string[]> {
    const cleaned = prefix.replace(/^\/+|\/+$/g, "");
    const root = cleaned ? `${cleaned}/` : "";
    const keys: string[] = [];
    const pending: string[] = [root];

    // Supabase Storage lists one folder level at a time and reports sub-folders
    // as entries with a null id. Callers rely on the flat contract the B2
    // backend provides ("every key under this prefix") — deleting a template
    // or a wedding strips nested version/role folders, so not walking them
    // would silently delete nothing and leave the bucket growing forever.
    while (pending.length > 0) {
      const directory = pending.pop() ?? "";
      let offset = 0;
      for (;;) {
        const { data, error } = await this.admin.storage
          .from(bucket)
          .list(directory, { limit: LIST_PAGE, offset });
        if (error) throw new StorageError(error.message, error.status);
        const entries = data ?? [];
        for (const entry of entries) {
          const key = `${directory}${entry.name}`;
          if (entry.id === null) pending.push(`${key}/`);
          else keys.push(key);
        }
        if (entries.length < LIST_PAGE) break;
        offset += entries.length;
      }
    }

    return keys;
  }

  async signedUrl(bucket: string, key: string, expiresInSeconds = 900): Promise<string> {
    const { data, error } = await this.admin.storage
      .from(bucket)
      .createSignedUrl(key, expiresInSeconds);
    if (error || !data?.signedUrl) throw new StorageError(error?.message ?? "No signed URL", error?.status);
    return data.signedUrl;
  }

  publicUrl(bucket: string, key: string): string {
    return publicObjectUrl(bucket, key);
  }
}