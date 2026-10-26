/**
 * Provider-independent object storage.
 *
 * The platform talks to this interface only. Supabase Storage and Backblaze B2
 * are interchangeable backends behind it, so switching storage does not touch
 * application code.
 */

export interface StorageUploadOptions {
  contentType?: string;
  /** Allow overwriting an existing object. Off by default (immutability). */
  upsert?: boolean;
  cacheControl?: string;
}

export interface StoredObject {
  body: Buffer;
  contentType: string | null;
}

export interface ObjectStorage {
  upload(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array | string,
    options?: StorageUploadOptions
  ): Promise<void>;

  /**
   * Returns null when the object does not exist. Read failures other than
   * "not found" throw.
   */
  download(bucket: string, key: string): Promise<StoredObject | null>;

  delete(bucket: string, key: string): Promise<void>;

  exists(bucket: string, key: string): Promise<boolean>;

  /**
   * Relocates an object. Throws a StorageError carrying the "already exists"
   * condition when the destination is already occupied, so callers can decide
   * whether to adopt the destination.
   */
  move(bucket: string, source: string, destination: string): Promise<void>;

  copy(bucket: string, source: string, destination: string): Promise<void>;

  list(bucket: string, prefix: string): Promise<string[]>;

  signedUrl(bucket: string, key: string, expiresInSeconds?: number): Promise<string>;

  /** Public URL; only valid for public areas (templates). */
  publicUrl(bucket: string, key: string): string;
}

/**
 * Error thrown by storage providers. `status` mirrors the HTTP status of the
 * backend response when one is available, which lets callers distinguish
 * "already exists" (409) from other failures without parsing messages.
 */
export class StorageError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

/** True when the error reports that the object/key already exists. */
export function isAlreadyExistsError(error: unknown): boolean {
  if (error instanceof StorageError) {
    if (error.status === 409) return true;
    return /already exists|exists/i.test(error.message);
  }
  const candidate = error as { status?: number; statusCode?: string; message?: string };
  if (candidate?.status === 409 || candidate?.statusCode === "409") return true;
  return /already exists|exists/i.test(candidate?.message ?? "");
}