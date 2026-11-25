export type TemplateVersionState =
  | "current"
  | "previous"
  | "draft"
  | "uploading"
  | "retired";

export interface TemplateVersionHistoryRow {
  id: string;
  version: string;
  status: string;
  is_current: boolean;
  created_at: string;
  published_at?: string | null;
  replaced_at?: string | null;
  delete_after?: string | null;
  retired_at?: string | null;
  retirement_reason?: string | null;
}

export interface TemplateVersionSummary {
  id: string;
  version: string;
  state: TemplateVersionState;
  isCurrent: boolean;
  publishedAt: string | null;
  replacedAt: string | null;
  deleteAfter: string | null;
  retiredAt: string | null;
  retirementReason: string | null;
  /** Milliseconds left before automatic deletion, or null when not applicable. */
  remainingMs: number | null;
  canRestore: boolean;
  previewUrl: string;
}

export function versionState(
  row: Pick<TemplateVersionHistoryRow, "status" | "is_current">
): TemplateVersionState {
  if (row.status === "retired") return "retired";
  if (row.status === "uploading") return "uploading";
  if (row.status === "draft") return "draft";
  if (row.status === "published" && row.is_current) return "current";
  if (row.status === "previous") return "previous";
  // A legacy non-current published row is a retained release.
  if (row.status === "published") return "previous";
  return "draft";
}

/**
 * Turns version rows into the admin history model. Kept pure so the countdown
 * and restore eligibility rules can be tested without a database.
 */
export function summarizeTemplateVersions(options: {
  versions: readonly TemplateVersionHistoryRow[];
  templateSlug: string;
  now?: number;
  retentionHours?: number;
}): TemplateVersionSummary[] {
  const now = options.now ?? Date.now();
  const slug = options.templateSlug;
  const summaries = options.versions.map((row) => {
    const state = versionState(row);
    const publishedAt = row.published_at ?? row.created_at;
    const deleteAfter = row.delete_after ?? null;
    const deleteAt = deleteAfter ? Date.parse(deleteAfter) : null;
    const remainingMs =
      state === "previous" && deleteAt !== null && Number.isFinite(deleteAt)
        ? Math.max(0, deleteAt - now)
        : null;
    const canRestore =
      state === "previous" &&
      !row.retired_at &&
      (deleteAt === null || (Number.isFinite(deleteAt) && deleteAt > now));

    return {
      id: row.id,
      version: row.version,
      state,
      isCurrent: state === "current",
      publishedAt,
      replacedAt: row.replaced_at ?? null,
      deleteAfter,
      retiredAt: row.retired_at ?? null,
      retirementReason: row.retirement_reason ?? null,
      remainingMs,
      canRestore,
      previewUrl: `/templates/${encodeURIComponent(slug)}/demo?version=${encodeURIComponent(row.id)}`,
    } satisfies TemplateVersionSummary;
  });

  return summaries.sort((a, b) => {
    // Group by meaning first: the live release, then restorable releases, then
    // work in progress, and finally retired cleanup records. Within a group the
    // newest release wins so the history reads top-down.
    const rank: Record<TemplateVersionState, number> = {
      current: 0,
      previous: 1,
      draft: 2,
      uploading: 2,
      retired: 3,
    };
    const rankDiff = rank[a.state] - rank[b.state];
    if (rankDiff !== 0) return rankDiff;
    const at = Date.parse(a.publishedAt ?? "");
    const bt = Date.parse(b.publishedAt ?? "");
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });
}
