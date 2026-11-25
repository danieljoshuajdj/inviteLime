import type { Supabase } from "@/lib/services/helpers";
import { TEMPLATE_BUCKET, type ObjectStorage } from "@/lib/services/storage";
import { verifyTemplateVersionCompatibility } from "@/lib/services/template-version-compatibility";

/**
 * Template-version cleanup.
 *
 * Versions are immutable and invitations pin the exact row they were purchased
 * on. The lifecycle has three distinct cleanup paths:
 *
 *  1. Upload: a new draft replaces older *draft* rows. Published/previous
 *     releases are never touched here.
 *  2. Publish: the replaced published version becomes `previous` and is kept
 *     for the retention window (72 hours). Nothing is deleted at publish time.
 *  3. Retention/rollback: a `previous` version that has expired, or the
 *     version rejected by a rollback, is marked `retired` and then permanently
 *     removed — row and storage prefix.
 *
 * Retired rows are the retry record. They are never served by the runtime, so
 * a failed storage delete leaves only an unavailable row. The files are
 * deleted before the row: a storage failure therefore keeps a row that still
 * names the prefix, and the next maintenance run retries it. Deleting the row
 * first would orphan files with no handle left to remove them.
 *
 * Guest drafts are throwaway builder state. When a version is retired its
 * drafts are repointed to the current version by the database switch function,
 * so the old row can go without breaking an in-progress builder session.
 */

export interface TemplateVersionRow {
  id: string;
  version: string;
  storage_prefix: string | null;
  manifest?: Record<string, unknown> | null;
  status: string;
  is_current: boolean;
  created_at: string;
  published_at?: string | null;
  replaced_at?: string | null;
  delete_after?: string | null;
  retired_at?: string | null;
  retirement_reason?: string | null;
}

export type VersionCleanupSkipReason =
  | "current-version"
  | "upload-in-progress"
  | "not-a-draft"
  | "not-retired"
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

export interface PurgeTemplateVersionResult {
  versionId: string;
  version: string | null;
  deleted: boolean;
  alreadyDeleted: boolean;
  deletedObjects: number;
  warnings: string[];
}

const VERSION_COLUMNS =
  "id, version, storage_prefix, status, is_current, created_at, published_at, replaced_at, delete_after, retired_at, retirement_reason";

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
export async function sweepOrphanedTemplateObjects(options: {
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
 * Removes superseded *draft* versions after a new upload.
 *
 * Published/previous versions are deliberately untouched: they are either the
 * live release or a retained rollback candidate. A draft pinned by a builder
 * session is kept until the next publish repoints that session.
 */
export async function cleanupSupersededDraftVersions(options: {
  supabase: Supabase;
  templateId: string;
  newVersionId: string;
  storage: ObjectStorage;
}): Promise<VersionCleanupResult> {
  const { supabase, templateId, newVersionId, storage } = options;

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
    if (version.status !== "draft") {
      skipped.push({
        id: version.id,
        version: version.version,
        reason:
          version.status === "uploading"
            ? "upload-in-progress"
            : version.status === "published" && version.is_current
              ? "current-version"
              : "not-a-draft",
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
      if (
        (await hasInvitationReference(supabase, version.id)) ||
        (await hasGuestDraftReference(supabase, version.id))
      ) {
        skipped.push({
          id: version.id,
          version: version.version,
          reason: "referenced-by-guest-draft",
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
        `Kept v${version.version}: could not check references (${
          err instanceof Error ? err.message : String(err)
        }).`
      );
      continue;
    }

    // Conditional delete: never remove a row that a concurrent publish has
    // just made current or a concurrent upload has re-claimed.
    const { data, error } = await supabase
      .from("template_versions")
      .delete()
      .eq("id", version.id)
      .eq("template_id", templateId)
      .eq("status", "draft")
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
 * Permanently removes one retired version: its stored files first, then its
 * row. If the storage delete fails the retired row survives as the retry
 * record and the version stays unavailable.
 */
export async function purgeTemplateVersion(options: {
  supabase: Supabase;
  templateId: string;
  versionId: string;
  storage: ObjectStorage;
  /**
   * If a race left an invitation or builder draft on the retired version, move
   * it to this live release before deleting the files. Without a target the
   * purge is refused, because deleting files would break that invitation.
   */
  repointToVersionId?: string;
}): Promise<PurgeTemplateVersionResult> {
  const { supabase, templateId, versionId, storage, repointToVersionId } = options;
  const warnings: string[] = [];

  const { data, error } = await supabase
    .from("template_versions")
    .select(VERSION_COLUMNS)
    .eq("id", versionId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      versionId,
      version: null,
      deleted: false,
      alreadyDeleted: true,
      deletedObjects: 0,
      warnings,
    };
  }

  const version = data as TemplateVersionRow;
  if (version.is_current || version.status !== "retired") {
    return {
      versionId,
      version: version.version,
      deleted: false,
      alreadyDeleted: false,
      deletedObjects: 0,
      warnings: [
        `v${version.version} was kept: only a retired, non-current version can be purged.`,
      ],
    };
  }

  try {
    let invitationReference = await hasInvitationReference(supabase, version.id);
    let draftReference = await hasGuestDraftReference(supabase, version.id);

    // A retry can find a stray reference created by a race. Move it to the
    // live replacement before touching storage; never delete files under a
    // row that is still in use.
    if (
      (invitationReference || draftReference) &&
      repointToVersionId &&
      repointToVersionId !== version.id
    ) {
      if (invitationReference) {
        const { error: repointError } = await supabase
          .from("weddings")
          .update({ template_version_id: repointToVersionId })
          .eq("template_version_id", version.id);
        if (repointError) throw new Error(repointError.message);
      }
      if (draftReference) {
        const { error: repointError } = await supabase
          .from("guest_drafts")
          .update({ template_version_id: repointToVersionId })
          .eq("template_version_id", version.id);
        if (repointError) throw new Error(repointError.message);
      }
      invitationReference = await hasInvitationReference(supabase, version.id);
      draftReference = await hasGuestDraftReference(supabase, version.id);
    }

    if (invitationReference || draftReference) {
      return {
        versionId,
        version: version.version,
        deleted: false,
        alreadyDeleted: false,
        deletedObjects: 0,
        warnings: [
          `v${version.version} was kept: ${
            invitationReference ? "an invitation" : "a builder draft"
          } still references it.`,
        ],
      };
    }
  } catch (err) {
    return {
      versionId,
      version: version.version,
      deleted: false,
      alreadyDeleted: false,
      deletedObjects: 0,
      warnings: [
        `v${version.version} was kept: reference check failed (${
          err instanceof Error ? err.message : String(err)
        }).`,
      ],
    };
  }

  let deletedObjects = 0;
  const prefix = normalizeStoragePrefix(version.storage_prefix);
  if (!isSafeTemplateVersionPrefix(prefix, templateId)) {
    warnings.push(
      `v${version.version} files were not removed: the storage prefix is outside this template's namespace.`
    );
  } else {
    let sharedPrefix = false;
    try {
      sharedPrefix = await isPrefixSharedByAnotherVersion(
        supabase,
        templateId,
        version.storage_prefix ?? "",
        version.id
      );
    } catch (err) {
      return {
        versionId,
        version: version.version,
        deleted: false,
        alreadyDeleted: false,
        deletedObjects: 0,
        warnings: [
          `v${version.version} was kept: could not verify prefix ownership (${
            err instanceof Error ? err.message : String(err)
          }).`,
        ],
      };
    }

    if (sharedPrefix) {
      warnings.push(
        `v${version.version} files were not removed: another version uses the same storage prefix.`
      );
    } else {
      const storageResult = await deleteTemplateVersionObjects(
        storage,
        templateId,
        prefix
      );
      deletedObjects += storageResult.deleted;
      if (storageResult.error) {
        return {
          versionId,
          version: version.version,
          deleted: false,
          alreadyDeleted: false,
          deletedObjects,
          warnings: [
            ...warnings,
            `v${version.version} is unavailable, but its files could not be deleted yet: ${storageResult.error.message}`,
          ],
        };
      }
    }
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("template_versions")
    .delete()
    .eq("id", version.id)
    .eq("template_id", templateId)
    .eq("status", "retired")
    .eq("is_current", false)
    .select("id");
  if (deleteError) {
    warnings.push(
      `v${version.version} files were removed, but its database row could not be deleted yet: ${deleteError.message}`
    );
    return {
      versionId,
      version: version.version,
      deleted: false,
      alreadyDeleted: false,
      deletedObjects,
      warnings,
    };
  }
  if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
    warnings.push(
      `v${version.version} changed during purge; its database row was left in place.`
    );
    return {
      versionId,
      version: version.version,
      deleted: false,
      alreadyDeleted: false,
      deletedObjects,
      warnings,
    };
  }

  return {
    versionId,
    version: version.version,
    deleted: true,
    alreadyDeleted: false,
    deletedObjects,
    warnings,
  };
}

export interface TemplateVersionRetentionResult {
  /** Expired `previous` versions switched to `retired` this run. */
  retired: number;
  /** Retired rows whose files and row were removed this run. */
  purged: number;
  deletedObjects: number;
  /** Versions that remain for a later run (usually a storage failure). */
  failures: number;
  warnings: string[];
}

/**
 * Retention sweep for `/api/cron/maintenance`.
 *
 * Finds `previous` releases whose rollback window has ended, asks the database
 * to retire them (which repoints any remaining invitation to the live release),
 * then purges every retired row. Retired rows from earlier failed storage
 * deletes are retried here too, so the sweep is idempotent.
 *
 * Storage is resolved lazily: a run with nothing to do never constructs the
 * object-storage client.
 */
export async function purgeDueTemplateVersions(options: {
  supabase: Supabase;
  getStorage: () => Promise<ObjectStorage>;
  now?: Date;
  batchSize?: number;
}): Promise<TemplateVersionRetentionResult> {
  const { supabase, getStorage } = options;
  const nowIso = (options.now ?? new Date()).toISOString();
  const batch = Math.max(1, options.batchSize ?? 20);
  const result: TemplateVersionRetentionResult = {
    retired: 0,
    purged: 0,
    deletedObjects: 0,
    failures: 0,
    warnings: [],
  };

  const [dueResult, retiredResult] = await Promise.all([
    supabase
      .from("template_versions")
      .select("id, template_id, version")
      .eq("status", "previous")
      .lte("delete_after", nowIso)
      .order("delete_after", { ascending: true })
      .limit(batch),
    supabase
      .from("template_versions")
      .select("id, template_id")
      .eq("status", "retired")
      .order("retired_at", { ascending: true })
      .limit(batch),
  ]);

  if (dueResult.error) {
    result.failures += 1;
    result.warnings.push(
      `Could not load expired template versions: ${dueResult.error.message}`
    );
  }
  if (retiredResult.error) {
    result.failures += 1;
    result.warnings.push(
      `Could not load retired template versions: ${retiredResult.error.message}`
    );
  }

  const due = (dueResult.data ?? []) as Array<{
    id: string;
    template_id: string;
    version: string;
  }>;
  const toPurge = new Map<string, { id: string; template_id: string }>();
  for (const row of (retiredResult.data ?? []) as Array<{
    id: string;
    template_id: string;
  }>) {
    toPurge.set(row.id, row);
  }

  if (due.length === 0 && toPurge.size === 0) return result;

  let storage: ObjectStorage;
  try {
    storage = await getStorage();
  } catch (err) {
    result.failures += 1;
    result.warnings.push(
      `Template-version retention was skipped: object storage is unavailable (${
        err instanceof Error ? err.message : String(err)
      }).`
    );
    return result;
  }

  // Resolve the live release once per template. It is the destination for any
  // invitation still pinned to an expiring version, and it must be readable
  // before the expiring release is retired.
  const currentByTemplate = new Map<
    string,
    { id: string; version: string } | null
  >();
  async function currentVersion(templateId: string) {
    if (currentByTemplate.has(templateId)) {
      return currentByTemplate.get(templateId) ?? null;
    }
    const { data, error } = await supabase
      .from("template_versions")
      .select("id, version")
      .eq("template_id", templateId)
      .eq("status", "published")
      .eq("is_current", true)
      .maybeSingle();
    if (error) {
      result.failures += 1;
      result.warnings.push(
        `Could not resolve the live release for template ${templateId}: ${error.message}`
      );
      currentByTemplate.set(templateId, null);
      return null;
    }
    const value = (data as { id: string; version: string } | null) ?? null;
    currentByTemplate.set(templateId, value);
    return value;
  }

  for (const row of due) {
    const current = await currentVersion(row.template_id);
    if (!current) {
      result.failures += 1;
      result.warnings.push(
        `Kept expired v${row.version}: its template has no live release to move invitations to.`
      );
      continue;
    }

    // Verify the live package before repointing anything. If it cannot render,
    // the expiring release is safer and stays available beyond its window.
    try {
      const compatibility = await verifyTemplateVersionCompatibility({
        supabase,
        templateId: row.template_id,
        versionId: current.id,
        storage,
        purpose: "retire",
        sourceVersionIds: [row.id],
      });
      if (!compatibility.ok) {
        result.failures += 1;
        result.warnings.push(
          `Kept expired v${row.version}: the live release v${current.version} is not compatible (${compatibility.issues
            .map((issue) => issue.message)
            .join(" ")})`
        );
        continue;
      }
    } catch (err) {
      result.failures += 1;
      result.warnings.push(
        `Kept expired v${row.version}: compatibility check failed (${
          err instanceof Error ? err.message : String(err)
        }).`
      );
      continue;
    }

    const { data, error } = await supabase.rpc("retire_template_version", {
      p_template_id: row.template_id,
      p_version_id: row.id,
      p_reason: "expired",
    });
    if (error) {
      result.failures += 1;
      result.warnings.push(
        `Could not retire v${row.version}: ${error.message}`
      );
      continue;
    }
    const outcome = data as { ok?: boolean } | null;
    if (!outcome?.ok) {
      result.failures += 1;
      result.warnings.push(`Could not retire v${row.version}: no result`);
      continue;
    }
    result.retired += 1;
    toPurge.set(row.id, { id: row.id, template_id: row.template_id });
  }

  for (const row of toPurge.values()) {
    try {
      const current = await currentVersion(row.template_id);
      const purge = await purgeTemplateVersion({
        supabase,
        templateId: row.template_id,
        versionId: row.id,
        storage,
        repointToVersionId: current?.id,
      });
      result.deletedObjects += purge.deletedObjects;
      result.warnings.push(...purge.warnings);
      if (purge.deleted || purge.alreadyDeleted) {
        result.purged += 1;
      } else {
        result.failures += 1;
      }
    } catch (err) {
      result.failures += 1;
      result.warnings.push(
        `Could not purge template version ${row.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return result;
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
