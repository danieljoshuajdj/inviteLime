import type { Supabase } from "@/lib/services/helpers";
import { TEMPLATE_BUCKET, type ObjectStorage } from "@/lib/services/storage";

/**
 * Template-version cleanup.
 *
 * A new package upload replaces the previous release, but template versions
 * are immutable and invitations pin the exact row they were purchased on. The
 * cleanup therefore runs in two safe phases:
 *
 *  1. After an upload, superseded *draft* rows are removed immediately. The
 *     currently published version is kept until the replacement is published,
 *     so demos and live invitations never lose their package.
 *  2. After a publish, every superseded version that is not pinned by an
 *     invitation is removed (row first, then storage objects). Versions still
 *     referenced by invitations are kept so those invitations keep rendering.
 *
 * Guest drafts are throwaway builder state. Once the replacement is published
 * they are repointed to it, which lets the old version row go without breaking
 * an in-progress builder session.
 *
 * Ordering matters: the database row is deleted before its storage prefix. A
 * failed storage delete therefore leaves only unreferenced objects, which the
 * orphan sweep retries on the next upload/publish. Deleting storage first would
 * leave a live row pointing at missing files if the row delete failed.
 */

export interface TemplateVersionRow {
  id: string;
  version: string;
  storage_prefix: string | null;
  status: string;
  is_current: boolean;
  created_at: string;
}

export type VersionCleanupSkipReason =
  | "current-version"
  | "upload-in-progress"
  | "referenced-by-invitation"
  | "referenced-by-guest-draft"
  | "unsafe-storage-prefix"
  | "changed-during-cleanup"
  | "delete-failed";

export interface VersionCleanupSkipped {
  id: string;
  version: string;
  reason: VersionCleanupSkipReason;
  detail?: string;
}

export interface VersionCleanupResult {
  deletedVersions: Array<{ id: string; version: string }>;
  deletedObjects: number;
  skipped: VersionCleanupSkipped[];
  warnings: string[];
  remainingVersions: number;
  currentVersion: string | null;
}

export interface StaleUploadCleanupResult {
  deletedVersions: Array<{ id: string; version: string }>;
  deletedObjects: number;
  warnings: string[];
}

const VERSION_COLUMNS =
  "id, version, storage_prefix, status, is_current, created_at";

/** Rows that existed before `newVersionId`, in creation order. */
export function selectSupersededVersions(
  versions: readonly TemplateVersionRow[],
  newVersionId: string
): TemplateVersionRow[] {
  const ordered = [...versions].sort((a, b) => {
    const at = Date.parse(a.created_at);
    const bt = Date.parse(b.created_at);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
    // Equal/invalid timestamps: a stable id tie-breaker keeps the operation
    // deterministic. If the new row lands before an older row, that row is
    // treated as newer and kept — never the unsafe direction.
    return a.id.localeCompare(b.id);
  });
  const index = ordered.findIndex((version) => version.id === newVersionId);
  if (index <= 0) return [];
  return ordered.slice(0, index);
}

export function normalizeStoragePrefix(prefix: string | null | undefined): string | null {
  const value = prefix?.trim().replace(/^\/+|\/+$/g, "");
  if (!value) return null;
  return value;
}

/**
 * A version prefix may only be deleted when it is inside the template's own
 * namespace. This keeps a malformed/imported row from wiping a shared asset or
 * another template's package.
 */
export function isSafeTemplateVersionPrefix(
  prefix: string | null | undefined,
  templateId: string
): boolean {
  const value = normalizeStoragePrefix(prefix);
  if (!value || !value.startsWith(`${templateId}/`)) return false;
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

async function fetchVersions(
  supabase: Supabase,
  templateId: string
): Promise<TemplateVersionRow[]> {
  const { data, error } = await supabase
    .from("template_versions")
    .select(VERSION_COLUMNS)
    .eq("template_id", templateId);
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateVersionRow[];
}

async function hasInvitationReference(
  supabase: Supabase,
  versionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("weddings")
    .select("id")
    .eq("template_version_id", versionId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function hasGuestDraftReference(
  supabase: Supabase,
  versionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("guest_drafts")
    .select("id")
    .eq("template_version_id", versionId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function isPrefixSharedByAnotherVersion(
  supabase: Supabase,
  templateId: string,
  prefix: string,
  versionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("template_versions")
    .select("id")
    .eq("template_id", templateId)
    .eq("storage_prefix", prefix)
    .neq("id", versionId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Deletes every object under a version prefix. The operation is idempotent and
 * retried: a transient B2/S3 failure leaves the prefix for the next attempt or
 * the orphan sweep, never a row pointing at missing files.
 */
export async function deleteTemplateVersionObjects(
  storage: ObjectStorage,
  templateId: string,
  prefix: string | null | undefined,
  attempts = 3
): Promise<{ deleted: number; error: Error | null }> {
  if (!isSafeTemplateVersionPrefix(prefix, templateId)) {
    return { deleted: 0, error: new Error("Unsafe template storage prefix") };
  }

  const clean = normalizeStoragePrefix(prefix)!;
  let deleted = 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const keys = await storage.list(TEMPLATE_BUCKET, `${clean}/`);
      for (const key of keys) {
        await storage.delete(TEMPLATE_BUCKET, key);
        deleted += 1;
      }
      return { deleted, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }

  return { deleted, error: lastError };
}

/**
 * Removes object-store files under the template namespace that no remaining
 * version, thumbnail or preview references. This is the retry path for a
 * storage delete that failed after its database row was already removed.
 */
async function sweepOrphanedTemplateObjects(options: {
  supabase: Supabase;
  templateId: string;
  storage: ObjectStorage;
  versions: readonly TemplateVersionRow[];
}): Promise<{ deleted: number; warnings: string[] }> {
  const { supabase, templateId, storage, versions } = options;
  const warnings: string[] = [];

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("thumbnail_path, preview_gif_path")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) {
    return { deleted: 0, warnings: [`Orphan sweep skipped: ${templateError.message}`] };
  }

  const protectedPrefixes = new Set<string>();
  for (const version of versions) {
    const prefix = normalizeStoragePrefix(version.storage_prefix);
    if (isSafeTemplateVersionPrefix(prefix, templateId)) {
      protectedPrefixes.add(`${prefix}/`);
    }
  }

  const protectedKeys = new Set<string>([`${templateId}/thumbnail`]);
  for (const value of [
    (template as { thumbnail_path?: string | null } | null)?.thumbnail_path,
    (template as { preview_gif_path?: string | null } | null)?.preview_gif_path,
  ]) {
    const key =
      typeof value === "string" ? value.trim().replace(/^\/+/, "") : "";
    if (key.startsWith(`${templateId}/`)) protectedKeys.add(key);
  }

  let keys: string[];
  try {
    keys = await storage.list(TEMPLATE_BUCKET, `${templateId}/`);
  } catch (err) {
    return {
      deleted: 0,
      warnings: [
        `Orphan sweep skipped: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const prefixes = [...protectedPrefixes];
  const orphans = keys.filter(
    (key) =>
      !protectedKeys.has(key) &&
      !prefixes.some((prefix) => key.startsWith(prefix))
  );

  let deleted = 0;
  for (const key of orphans) {
    try {
      await storage.delete(TEMPLATE_BUCKET, key);
      deleted += 1;
    } catch (err) {
      warnings.push(
        `Could not remove orphaned object ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return { deleted, warnings };
}

/**
 * Removes superseded versions of one template.
 *
 * `protectCurrent` is true immediately after an upload (the previous published
 * version is still serving demos/invitations until the new one is published).
 * `repointGuestDrafts` is true only after the new version is published.
 */
export async function cleanupSupersededTemplateVersions(options: {
  supabase: Supabase;
  templateId: string;
  newVersionId: string;
  storage: ObjectStorage;
  protectCurrent?: boolean;
  repointGuestDrafts?: boolean;
}): Promise<VersionCleanupResult> {
  const {
    supabase,
    templateId,
    newVersionId,
    storage,
    protectCurrent = false,
    repointGuestDrafts = false,
  } = options;

  const versions = await fetchVersions(supabase, templateId);
  const target = versions.find((version) => version.id === newVersionId);
  if (!target) {
    throw new Error("The newly uploaded template version could not be found");
  }

  const superseded = selectSupersededVersions(versions, newVersionId);
  const deletedVersions: Array<{ id: string; version: string }> = [];
  const skipped: VersionCleanupSkipped[] = [];
  const warnings: string[] = [];
  let deletedObjects = 0;

  for (const version of superseded) {
    if (version.status === "uploading") {
      skipped.push({
        id: version.id,
        version: version.version,
        reason: "upload-in-progress",
      });
      continue;
    }

    if (protectCurrent && version.is_current) {
      skipped.push({
        id: version.id,
        version: version.version,
        reason: "current-version",
      });
      continue;
    }

    const prefix = normalizeStoragePrefix(version.storage_prefix);
    if (!isSafeTemplateVersionPrefix(prefix, templateId)) {
      skipped.push({
        id: version.id,
        version: version.version,
        reason: "unsafe-storage-prefix",
        detail: "The version is outside this template's storage namespace.",
      });
      warnings.push(
        `Kept v${version.version}: its storage prefix is outside the template namespace.`
      );
      continue;
    }

    try {
      if (await hasInvitationReference(supabase, version.id)) {
        skipped.push({
          id: version.id,
          version: version.version,
          reason: "referenced-by-invitation",
        });
        continue;
      }
    } catch (err) {
      skipped.push({
        id: version.id,
        version: version.version,
        reason: "delete-failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      warnings.push(
        `Kept v${version.version}: could not check invitation references (${
          err instanceof Error ? err.message : String(err)
        }).`
      );
      continue;
    }

    let guestDraftReference = false;
    try {
      guestDraftReference = await hasGuestDraftReference(supabase, version.id);
    } catch (err) {
      skipped.push({
        id: version.id,
        version: version.version,
        reason: "delete-failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      warnings.push(
        `Kept v${version.version}: could not check builder drafts (${
          err instanceof Error ? err.message : String(err)
        }).`
      );
      continue;
    }

    if (guestDraftReference) {
      if (!repointGuestDrafts || target.status !== "published") {
        skipped.push({
          id: version.id,
          version: version.version,
          reason: "referenced-by-guest-draft",
        });
        continue;
      }

      const { error: repointError } = await supabase
        .from("guest_drafts")
        .update({ template_version_id: target.id })
        .eq("template_version_id", version.id);
      if (repointError) {
        skipped.push({
          id: version.id,
          version: version.version,
          reason: "delete-failed",
          detail: repointError.message,
        });
        warnings.push(
          `Kept v${version.version}: could not move builder drafts to v${target.version} (${repointError.message}).`
        );
        continue;
      }
    }

    // Conditional delete: never remove a row that a concurrent publish has
    // just made current. Zero rows means the row changed under us, so it is
    // kept rather than reported as deleted.
    const { data, error } = await supabase
      .from("template_versions")
      .delete()
      .eq("id", version.id)
      .eq("template_id", templateId)
      .eq("is_current", false)
      .select("id");
    if (error) {
      if ((error as { code?: string }).code === "23503") {
        skipped.push({
          id: version.id,
          version: version.version,
          reason: "referenced-by-invitation",
        });
        continue;
      }
      skipped.push({
        id: version.id,
        version: version.version,
        reason: "delete-failed",
        detail: error.message,
      });
      warnings.push(
        `Could not delete v${version.version} from the database: ${error.message}`
      );
      continue;
    }
    if (!Array.isArray(data) || data.length === 0) {
      skipped.push({
        id: version.id,
        version: version.version,
        reason: "changed-during-cleanup",
      });
      continue;
    }

    deletedVersions.push({ id: version.id, version: version.version });

    let sharedPrefix = false;
    try {
      sharedPrefix = await isPrefixSharedByAnotherVersion(
        supabase,
        templateId,
        version.storage_prefix ?? "",
        version.id
      );
    } catch (err) {
      sharedPrefix = true;
      warnings.push(
        `Kept files for v${version.version}: could not verify prefix ownership (${
          err instanceof Error ? err.message : String(err)
        }).`
      );
    }

    if (sharedPrefix) {
      warnings.push(
        `Kept files for v${version.version}: another version uses the same storage prefix.`
      );
      continue;
    }

    const storageResult = await deleteTemplateVersionObjects(
      storage,
      templateId,
      prefix
    );
    deletedObjects += storageResult.deleted;
    if (storageResult.error) {
      warnings.push(
        `v${version.version} row removed, but its files could not be deleted yet: ${storageResult.error.message}`
      );
    }
  }

  const remaining = await fetchVersions(supabase, templateId);
  const sweep = await sweepOrphanedTemplateObjects({
    supabase,
    templateId,
    storage,
    versions: remaining,
  });
  deletedObjects += sweep.deleted;
  warnings.push(...sweep.warnings);

  return {
    deletedVersions,
    deletedObjects,
    skipped,
    warnings,
    remainingVersions: remaining.length,
    currentVersion:
      remaining.find((version) => version.is_current)?.version ?? null,
  };
}

/**
 * A crashed upload can leave an `uploading` claim behind. Claims older than the
 * grace period are removed (row first, then files) so they neither block the
 * next version number nor accumulate as orphaned rows.
 */
export async function cleanupStaleVersionUploads(options: {
  supabase: Supabase;
  templateId: string;
  storage: ObjectStorage;
  maxAgeMs?: number;
}): Promise<StaleUploadCleanupResult> {
  const { supabase, templateId, storage, maxAgeMs = 30 * 60 * 1000 } = options;
  const versions = await fetchVersions(supabase, templateId);
  const cutoff = Date.now() - maxAgeMs;
  const stale = versions.filter((version) => {
    if (version.status !== "uploading") return false;
    const created = Date.parse(version.created_at);
    return Number.isFinite(created) && created < cutoff;
  });

  const deletedVersions: Array<{ id: string; version: string }> = [];
  const warnings: string[] = [];
  let deletedObjects = 0;

  for (const version of stale) {
    if (
      !isSafeTemplateVersionPrefix(version.storage_prefix, templateId)
    ) {
      warnings.push(
        `Stale upload v${version.version} was kept: its storage prefix is outside the template namespace.`
      );
      continue;
    }

    // A stale claim should have no references, but never break one if a race
    // produced it.
    try {
      if (
        (await hasInvitationReference(supabase, version.id)) ||
        (await hasGuestDraftReference(supabase, version.id))
      ) {
        warnings.push(
          `Stale upload v${version.version} was kept because it is referenced.`
        );
        continue;
      }
    } catch (err) {
      warnings.push(
        `Stale upload v${version.version} was kept: reference check failed (${
          err instanceof Error ? err.message : String(err)
        }).`
      );
      continue;
    }

    const { data, error } = await supabase
      .from("template_versions")
      .delete()
      .eq("id", version.id)
      .eq("template_id", templateId)
      .eq("status", "uploading")
      .select("id");
    if (error) {
      warnings.push(
        `Could not remove stale upload v${version.version}: ${error.message}`
      );
      continue;
    }
    if (!Array.isArray(data) || data.length === 0) continue;

    deletedVersions.push({ id: version.id, version: version.version });

    let sharedPrefix = false;
    try {
      sharedPrefix = await isPrefixSharedByAnotherVersion(
        supabase,
        templateId,
        version.storage_prefix ?? "",
        version.id
      );
    } catch {
      sharedPrefix = true;
    }
    if (sharedPrefix) continue;

    const storageResult = await deleteTemplateVersionObjects(
      storage,
      templateId,
      version.storage_prefix
    );
    deletedObjects += storageResult.deleted;
    if (storageResult.error) {
      warnings.push(
        `Stale upload v${version.version} row removed, but its files could not be deleted yet: ${storageResult.error.message}`
      );
    }
  }

  return { deletedVersions, deletedObjects, warnings };
}
