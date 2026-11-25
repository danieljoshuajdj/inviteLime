import "server-only";

import type { Supabase } from "@/lib/services/helpers";
import {
  summarizeTemplateVersions,
  type TemplateVersionHistoryRow,
  type TemplateVersionSummary,
} from "@/lib/services/template-version-history";

/**
 * Template version retention.
 *
 * Publishing and restoring a version must switch the current release, repoint
 * every invitation and builder draft, and record retention metadata in one
 * transaction. That logic lives in the security-definer functions added by
 * `00025_template_version_retention.sql`; this module is the typed client for
 * them plus the admin history read.
 */

export { verifyTemplateVersionCompatibility } from "@/lib/services/template-version-compatibility";
export type {
  TemplateCompatibilityIssue,
  TemplateCompatibilityPurpose,
  TemplateCompatibilityResult,
} from "@/lib/services/template-version-compatibility";

/** How long a replaced version stays restorable before maintenance retires it. */
export const TEMPLATE_VERSION_RETENTION_HOURS = 72;

/**
 * Reads the operator override for the rollback window. Invalid or missing
 * values fall back to the documented default so a bad env var can never make
 * releases disappear immediately.
 */
export function resolveTemplateVersionRetentionHours(
  env: {
    TEMPLATE_VERSION_RETENTION_HOURS?: string;
    /** Present so this shape remains assignable from `process.env`. */
    NODE_ENV?: string;
  } = process.env
): number {
  const raw = Number(env.TEMPLATE_VERSION_RETENTION_HOURS);
  return Number.isFinite(raw) && raw >= 1
    ? Math.floor(raw)
    : TEMPLATE_VERSION_RETENTION_HOURS;
}

export interface RetainedVersion {
  id: string;
  version: string;
  /** End of the rollback window, ISO-8601, or null for a current version. */
  deleteAfter: string | null;
}

export interface PublishTemplateVersionResult {
  ok: boolean;
  /** True when the target was already the current release; nothing changed. */
  alreadyCurrent?: boolean;
  versionId: string;
  version: string;
  previous: RetainedVersion | null;
  repointedInvitations: number;
  repointedDrafts: number;
  retentionHours: number;
}

export interface RollbackTemplateVersionResult {
  ok: boolean;
  versionId: string;
  version: string;
  /** The version that was current and is now retired. */
  rejected: { id: string; version: string } | null;
  repointedInvitations: number;
  repointedDrafts: number;
}

export interface TemplateVersionHistory {
  template: {
    id: string;
    name: string;
    slug: string;
    status: string;
    /** Version string of the live release, or null when none is published. */
    currentVersion: string | null;
  } | null;
  versions: TemplateVersionSummary[];
}

const HISTORY_COLUMNS =
  "id, version, status, is_current, created_at, published_at, replaced_at, delete_after, retired_at, retirement_reason";

/**
 * Makes a draft the single current release and starts the retention window for
 * the version it replaces. Throws with the database message so callers can
 * distinguish a missing migration from a rejected transition.
 */
export async function publishTemplateVersion(options: {
  supabase: Supabase;
  templateId: string;
  versionId: string;
  retentionHours?: number;
}): Promise<PublishTemplateVersionResult> {
  const { data, error } = await options.supabase.rpc("publish_template_version", {
    p_template_id: options.templateId,
    p_version_id: options.versionId,
    p_retention_hours:
      options.retentionHours ?? resolveTemplateVersionRetentionHours(),
  });
  if (error) throw new Error(error.message);

  const result = data as unknown as PublishTemplateVersionResult | null;
  if (!result?.ok) throw new Error("Publish did not complete");
  return result;
}

/**
 * Makes a retained previous version current again and retires the rejected
 * release. The database enforces the retention window and rejects a version
 * that is already retired.
 */
export async function rollbackTemplateVersion(options: {
  supabase: Supabase;
  templateId: string;
  targetVersionId: string;
}): Promise<RollbackTemplateVersionResult> {
  const { data, error } = await options.supabase.rpc("rollback_template_version", {
    p_template_id: options.templateId,
    p_target_version_id: options.targetVersionId,
  });
  if (error) throw new Error(error.message);

  const result = data as unknown as RollbackTemplateVersionResult | null;
  if (!result?.ok) throw new Error("Rollback did not complete");
  return result;
}

/**
 * Every version of one template, newest first, with retention state and the
 * remaining rollback time. Returns `template: null` when the template does not
 * exist so the route can answer 404 without treating it as an error.
 */
export async function listTemplateVersionHistory(
  supabase: Supabase,
  templateId: string
): Promise<TemplateVersionHistory> {
  const [templateRes, versionsRes] = await Promise.all([
    supabase.from("templates").select("id, name, slug, status").eq("id", templateId).maybeSingle(),
    supabase
      .from("template_versions")
      .select(HISTORY_COLUMNS)
      .eq("template_id", templateId)
      .order("created_at", { ascending: false }),
  ]);

  if (templateRes.error) throw new Error(templateRes.error.message);
  if (versionsRes.error) throw new Error(versionsRes.error.message);

  const template = templateRes.data as {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  if (!template) return { template: null, versions: [] };

  const versions = summarizeTemplateVersions({
    versions: (versionsRes.data ?? []) as unknown as TemplateVersionHistoryRow[],
    templateSlug: template.slug,
  });

  return {
    template: {
      ...template,
      currentVersion:
        versions.find((version) => version.state === "current")?.version ?? null,
    },
    versions,
  };
}
