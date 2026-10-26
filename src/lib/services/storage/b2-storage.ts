import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { WEDDING_BUCKET, TEMPLATE_BUCKET } from "./buckets";
import { publicObjectUrl } from "./urls";
import {
  StorageError,
  isAlreadyExistsError,
  type ObjectStorage,
  type StoredObject,
  type StorageUploadOptions,
} from "./abstraction";

/**
 * Backblaze B2 object storage (S3-compatible API).
 *
 * Logical storage areas map to physical B2 buckets:
 *   templates → B2_BUCKET_NAME          (public — served via B2_PUBLIC_BASE_URL)
 *   weddings  → B2_WEDDINGS_BUCKET      (private — only read through /api/media)
 *
 * Credentials and the endpoint live on the server only. Templates are public
 * by design (they are the product every invitation renders); wedding media is
 * never addressed with these credentials or a public URL.
 */
export function createBackblazeStorage(): ObjectStorage {
  const endpoint = process.env.B2_ENDPOINT?.replace(/\/+$/, "");
  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  if (!endpoint || !keyId || !applicationKey) {
    throw new Error(
      "Backblaze B2 is not configured: set B2_ENDPOINT, B2_KEY_ID and B2_APPLICATION_KEY."
    );
  }

  const client = new S3Client({
    region: process.env.B2_REGION ?? "us-east-005",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: applicationKey,
    },
  });

  return new BackblazeStorage(client);
}

class BackblazeStorage implements ObjectStorage {
  constructor(private readonly client: S3Client) {}

  /** Logical area → physical B2 bucket name. */
  private physical(bucket: string): string {
    if (bucket === TEMPLATE_BUCKET && process.env.B2_BUCKET_NAME) {
      return process.env.B2_BUCKET_NAME;
    }
    if (bucket === WEDDING_BUCKET) {
      const name = process.env.B2_WEDDINGS_BUCKET ?? process.env.B2_BUCKET_NAME;
      if (name) return name;
    }
    throw new StorageError(
      `No Backblaze B2 bucket configured for "${bucket}" (set B2_BUCKET_NAME / B2_WEDDINGS_BUCKET).`
    );
  }

  async upload(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array | string,
    options: StorageUploadOptions = {}
  ): Promise<void> {
    const physical = this.physical(bucket);
    const upsert = options.upsert ?? false;

    // The S3 API has no conditional write, so immutability is enforced with a
    // pre-check. On a conflict we throw the same "already exists" condition the
    // Supabase backend reports, and callers react identically.
    if (!upsert && (await this.exists(bucket, key))) {
      throw new StorageError(`Object with key "${key}" already exists`, 409);
    }

    await this.wrap(
      () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: physical,
            Key: key,
            Body: body as Uint8Array,
            ContentType: options.contentType,
            CacheControl: options.cacheControl,
          })
        )
    );
  }

  async download(bucket: string, key: string): Promise<StoredObject | null> {
    const physical = this.physical(bucket);
    try {
      const output = await this.client.send(
        new GetObjectCommand({ Bucket: physical, Key: key })
      );
      if (!output.Body) return null;
      const bytes = await output.Body.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: output.ContentType ?? null };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw this.toStorageError(error);
    }
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.wrap(() =>
      this.client.send(
        new DeleteObjectCommand({ Bucket: this.physical(bucket), Key: key })
      )
    );
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const physical = this.physical(bucket);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: physical, Key: key }));
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw this.toStorageError(error);
    }
  }

  async move(bucket: string, source: string, destination: string): Promise<void> {
    if (await this.exists(bucket, destination)) {
      throw new StorageError(
        `Object with key "${destination}" already exists`,
        409
      );
    }
    await this.copy(bucket, source, destination);
    await this.delete(bucket, source);
  }

  async copy(bucket: string, source: string, destination: string): Promise<void> {
    const physical = this.physical(bucket);
    await this.wrap(() =>
      this.client.send(
        new CopyObjectCommand({
          Bucket: physical,
          Key: destination,
          CopySource: `${physical}/${source}`,
        })
      )
    );
  }

  async list(bucket: string, prefix: string): Promise<string[]> {
    const physical = this.physical(bucket);
    const cleaned = prefix.replace(/^\/+/, "");
    const keys: string[] = [];
    let continuation: string | undefined;
    do {
      const output = await this.wrap(() =>
        this.client.send(
          new ListObjectsV2Command({
            Bucket: physical,
            Prefix: cleaned,
            ContinuationToken: continuation,
          })
        )
      );
      for (const item of output.Contents ?? []) {
        if (item.Key) keys.push(item.Key);
      }
      continuation = output.NextContinuationToken;
    } while (continuation);
    return keys;
  }

  async signedUrl(bucket: string, key: string, expiresInSeconds = 900): Promise<string> {
    const physical = this.physical(bucket);
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: physical, Key: key }),
        { expiresIn: expiresInSeconds }
      );
    } catch (error) {
      throw this.toStorageError(error);
    }
  }

  publicUrl(bucket: string, key: string): string {
    return publicObjectUrl(bucket, key);
  }

  private async wrap<T>(send: () => Promise<T>): Promise<T> {
    try {
      return await send();
    } catch (error) {
      throw this.toStorageError(error);
    }
  }

  private isNotFound(error: unknown): boolean {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (status === 404 || status === 400) return true;
    const message = (error as { message?: string })?.message ?? "";
    return /not found|does not exist|not exist|NoSuchKey/i.test(message);
  }

  private toStorageError(error: unknown): StorageError {
    if (error instanceof StorageError) return error;
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    const message = (error as { message?: string })?.message ?? "Storage request failed";
    // Normalise the "already exists" condition like the Supabase backend does.
    if (isAlreadyExistsError(error)) {
      return new StorageError(message, status ?? 409);
    }
    return new StorageError(message, status);
  }
}