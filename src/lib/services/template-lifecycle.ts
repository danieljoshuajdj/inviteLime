import type { Supabase } from "@/lib/services/helpers";

export interface TemplateUsageCounts {
  activeInvitations: number;
  totalInvitations: number;
}

export interface WeddingTemplateRef {
  id: string;
  template_id: string | null;
  template_version_id: string | null;
  status: string | null;
  expiration_date: string | null;
}

/**
 * An invitation counts as *active* for a template when it is live (status
 * "active") AND not past its expiration date. Everything else — drafts,
 * cancelled, expired, or an expired-but-labeled-active invite — is non-active
 * and therefore must not block a permanent template deletion.
 */
export function isActiveWedding(
  wedding: Pick<WeddingTemplateRef, "status" | "expiration_date">
): boolean {
  if (wedding.status !== "active") return false;
  if (wedding.expiration_date == null) return true;
  return wedding.expiration_date >= todayDateString();
}

/** Local (server) date as YYYY-MM-DD, the format of `weddings.expiration_date`. */
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pure usage computation for one template. A wedding belongs to the template
 * when it pins the template directly (`template_id`) OR pins any of the
 * template's immutable version rows (`template_version_id`).
 */
export function computeTemplateUsage(
  weddings: readonly WeddingTemplateRef[],
  templateId: string,
  versionIds: readonly string[]
): TemplateUsageCounts {
  const versionSet = new Set(versionIds);
  let totalInvitations = 0;
  let activeInvitations = 0;
  for (const wedding of weddings) {
    const matches =
      wedding.template_id === templateId ||
      (wedding.template_version_id != null && versionSet.has(wedding.template_version_id));
    if (!matches) continue;
    totalInvitations += 1;
    if (isActiveWedding(wedding)) activeInvitations += 1;
  }
  return { activeInvitations, totalInvitations };
}

/**
 * Aggregate usage for many templates in one pass over the referencing
 * weddings. `versionsByTemplate` maps each template id to its version row ids.
 */
export function buildTemplateUsageMap(
  weddings: readonly WeddingTemplateRef[],
  versionsByTemplate: ReadonlyMap<string, readonly string[]>
): Map<string, TemplateUsageCounts> {
  const usage = new Map<string, TemplateUsageCounts>();
  for (const templateId of versionsByTemplate.keys()) {
    usage.set(
      templateId,
      computeTemplateUsage(weddings, templateId, versionsByTemplate.get(templateId) ?? [])
    );
  }
  return usage;
}

/** All version rows of a template (published and draft). */
export async function listTemplateVersions(
  supabase: Supabase,
  templateId: string
): Promise<Array<{ id: string; version: string; storage_prefix: string | null }>> {
  const { data, error } = await supabase
    .from("template_versions")
    .select("id, version, storage_prefix")
    .eq("template_id", templateId);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; version: string; storage_prefix: string | null }>;
}

/**
 * Every wedding that references the template, whether directly or through one
 * of its version rows. Used by the delete path to re-check "active" severity
 * server-side and to know exactly which invitations must be detached.
 */
export async function weddingsReferencingTemplate(
  supabase: Supabase,
  templateId: string,
  versionIds: readonly string[]
): Promise<WeddingTemplateRef[]> {
  const seen = new Map<string, WeddingTemplateRef>();
  const columns = "id, template_id, template_version_id, status, expiration_date";

  const byTemplate = await supabase
    .from("weddings")
    .select(columns)
    .eq("template_id", templateId);
  if (byTemplate.error) throw byTemplate.error;
  for (const row of (byTemplate.data ?? []) as WeddingTemplateRef[]) seen.set(row.id, row);

  if (versionIds.length > 0) {
    const byVersion = await supabase
      .from("weddings")
      .select(columns)
      .in("template_version_id", versionIds);
    if (byVersion.error) throw byVersion.error;
    for (const row of (byVersion.data ?? []) as WeddingTemplateRef[]) seen.set(row.id, row);
  }

  return [...seen.values()];
}

/**
 * DB-backed usage counts for a set of templates (used by the admin list and
 * the admin API).
 */
export async function fetchTemplateUsage(
  supabase: Supabase,
  templateIds: readonly string[]
): Promise<Map<string, TemplateUsageCounts>> {
  if (templateIds.length === 0) return new Map();

  const versionsByTemplate = new Map<string, string[]>();
  for (const templateId of templateIds) versionsByTemplate.set(templateId, []);

  const versions = await supabase
    .from("template_versions")
    .select("id, template_id")
    .in("template_id", templateIds);
  if (versions.error) throw versions.error;
  for (const row of (versions.data ?? []) as Array<{ id: string; template_id: string }>) {
    const list = versionsByTemplate.get(row.template_id);
    if (list) list.push(row.id);
  }

  const versionIds = [...new Set([...versionsByTemplate.values()].flat())];
  const seen = new Map<string, WeddingTemplateRef>();
  const columns = "id, template_id, template_version_id, status, expiration_date";

  const byTemplate = await supabase
    .from("weddings")
    .select(columns)
    .in("template_id", templateIds);
  if (byTemplate.error) throw byTemplate.error;
  for (const row of (byTemplate.data ?? []) as WeddingTemplateRef[]) seen.set(row.id, row);

  if (versionIds.length > 0) {
    const byVersion = await supabase
      .from("weddings")
      .select(columns)
      .in("template_version_id", versionIds);
    if (byVersion.error) throw byVersion.error;
    for (const row of (byVersion.data ?? []) as WeddingTemplateRef[]) seen.set(row.id, row);
  }

  return buildTemplateUsageMap([...seen.values()], versionsByTemplate);
}