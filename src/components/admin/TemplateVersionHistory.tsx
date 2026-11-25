"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { cn } from "@/lib/utils";
import { toast } from "@/components/account/toast";
import type {
  TemplateVersionState,
  TemplateVersionSummary,
} from "@/lib/services/template-version-history";

interface VersionHistoryResponse {
  ok?: boolean;
  retentionHours?: number;
  versions?: TemplateVersionSummary[];
  error?: string;
}

/** Shape of `issues` returned by the compatibility gate. */
interface CompatibilityIssue {
  code?: string;
  message: string;
}

interface RestoreResponse {
  ok?: boolean;
  version?: string;
  versionCount?: number;
  rejectedVersion?: string | null;
  repointedInvitations?: number;
  repointedDrafts?: number;
  cleanup?: {
    rejectedVersion: string | null;
    deletedObjects: number;
    pending: boolean;
    warnings: string[];
  } | null;
  warnings?: string[];
  error?: string;
  code?: string;
  issues?: CompatibilityIssue[];
}

interface PublishResponse {
  ok?: boolean;
  version?: string;
  versionCount?: number;
  previous?: { id: string; version: string; deleteAfter: string | null } | null;
  repointedInvitations?: number;
  repointedDrafts?: number;
  retentionHours?: number;
  warnings?: string[];
  error?: string;
  issues?: CompatibilityIssue[];
}

function issueText(issue: CompatibilityIssue | string): string {
  return typeof issue === "string" ? issue : issue.message;
}

export interface TemplateVersionHistoryProps {
  templateId: string;
  templateSlug: string;
  /** Called after publish/rollback so the template row can update in place. */
  onChanged?: (update: { currentVersion: string | null; versionCount?: number }) => void;
  /** Bumped by the parent after an upload or publish elsewhere on the page. */
  refreshToken?: number;
}

const STATE_LABEL: Record<TemplateVersionState, string> = {
  current: "Active",
  previous: "Previous",
  draft: "Draft",
  uploading: "Uploading",
  retired: "Retired",
};

function stateTone(state: TemplateVersionState): "success" | "warning" | "danger" | "default" {
  if (state === "current") return "success";
  if (state === "previous") return "warning";
  if (state === "retired") return "danger";
  return "default";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRemaining(ms: number | null): string {
  if (ms === null) return "";
  if (ms <= 0) return "Retention window ended — cleanup pending";
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainder = hours % 24;
    return remainder > 0 ? `${days}d ${remainder}h left` : `${days}d left`;
  }
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

function remainingFor(version: TemplateVersionSummary, now: number): number | null {
  if (!version.deleteAfter) return null;
  const at = Date.parse(version.deleteAfter);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Admin-only release history for one template.
 *
 * Publishing a package keeps the replaced release restorable for 72 hours.
 * This panel shows that countdown, previews any retained/draft release, and
 * exposes the atomic rollback endpoint. It never deletes anything itself: the
 * rollback route retires and purges the rejected release, and maintenance
 * removes other releases once their own windows end.
 */
export function TemplateVersionHistory({
  templateId,
  templateSlug,
  onChanged,
  refreshToken = 0,
}: TemplateVersionHistoryProps) {
  const [versions, setVersions] = useState<TemplateVersionSummary[] | null>(null);
  const [retentionHours, setRetentionHours] = useState(72);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [restoreTarget, setRestoreTarget] = useState<TemplateVersionSummary | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackIssues, setRollbackIssues] = useState<string[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/admin/templates/${templateId}/versions`, {
          cache: "no-store",
        });
        const json = await readJson<VersionHistoryResponse>(res);
        if (cancelled) return;
        if (!res.ok || !json.versions) {
          setError(json.error ?? "Could not load version history");
          return;
        }
        setVersions(json.versions);
        if (typeof json.retentionHours === "number") {
          setRetentionHours(json.retentionHours);
        }
        setNow(Date.now());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load version history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, reloadToken, refreshToken]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function refresh() {
    setLoading(true);
    setError(null);
    setReloadToken((token) => token + 1);
  }

  async function publish(version: TemplateVersionSummary) {
    setPublishingId(version.id);
    try {
      const res = await fetch(
        `/api/admin/templates/${templateId}/versions/${version.id}/publish`,
        { method: "POST" }
      );
      const json = await readJson<PublishResponse>(res);
      if (!res.ok) {
        const firstIssue = json.issues?.[0];
        const detail = firstIssue ? ` ${issueText(firstIssue)}` : "";
        throw new Error((json.error ?? "Publish failed") + detail);
      }
      const nextVersion = json.version ?? version.version;
      onChanged?.({
        currentVersion: nextVersion,
        ...(typeof json.versionCount === "number"
          ? { versionCount: json.versionCount }
          : {}),
      });
      const repointed = json.repointedInvitations ?? 0;
      const retention = json.retentionHours ?? retentionHours;
      toast(
        `v${nextVersion} published`,
        `${repointed} invitation${repointed === 1 ? "" : "s"} now use this release.${
          json.previous
            ? ` v${json.previous.version} stays restorable for ${retention} hours.`
            : ""
        }`
      );
      if (json.warnings?.length) {
        toast("Published with warnings", json.warnings[0]);
      }
      refresh();
    } catch (err) {
      toast("Publish failed", err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishingId(null);
    }
  }

  async function confirmRestore() {
    if (!restoreTarget || rollingBack) return;
    setRollingBack(true);
    setRollbackError(null);
    setRollbackIssues([]);
    try {
      const res = await fetch(
        `/api/admin/templates/${templateId}/versions/${restoreTarget.id}/restore`,
        { method: "POST" }
      );
      const json = await readJson<RestoreResponse>(res);
      if (!res.ok) {
        setRollbackError(json.error ?? "Restore failed");
        setRollbackIssues((json.issues ?? []).map(issueText));
        return;
      }

      const restored = json.version ?? restoreTarget.version;
      onChanged?.({
        currentVersion: restored,
        ...(typeof json.versionCount === "number"
          ? { versionCount: json.versionCount }
          : {}),
      });
      setRestoreTarget(null);

      const repointed = json.repointedInvitations ?? 0;
      const pendingNote = json.cleanup?.pending
        ? " The rejected version is out of service; its file cleanup will be retried automatically."
        : json.rejectedVersion
          ? ` v${json.rejectedVersion} was removed immediately.`
          : "";
      toast(
        `Restored v${restored}`,
        `${repointed} invitation${repointed === 1 ? "" : "s"} now use this release.${pendingNote}`
      );
      if (json.warnings?.length) {
        toast("Restored with warnings", json.warnings[0]);
      }
      refresh();
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRollingBack(false);
    }
  }

  const current = versions?.find((version) => version.state === "current") ?? null;
  const hasRows = (versions?.length ?? 0) > 0;

  return (
    <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-body-sm font-semibold text-on-surface">
            <Icon name="history_edu" size="sm" className="text-secondary" />
            Version History &amp; Rollback
          </p>
          <p className="mt-1 max-w-2xl font-body-xs text-on-surface-variant">
            Publishing updates every invitation using this template in one step. The replaced
            release stays restorable for {retentionHours} hours, then maintenance removes it.
            Invitation links, customer content, media, music, RSVP responses and settings are
            preserved.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon="refresh"
          loading={loading}
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>

      {loading && !versions ? (
        <p className="mt-4 font-body-xs text-on-surface-variant">Loading releases…</p>
      ) : error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3">
          <Icon name="error" size="sm" className="mt-0.5 text-error" />
          <div>
            <p className="font-body-xs font-semibold text-error">{error}</p>
            <button
              type="button"
              className="mt-1 font-body-xs text-secondary underline"
              onClick={refresh}
            >
              Try again
            </button>
          </div>
        </div>
      ) : !hasRows ? (
        <p className="mt-4 font-body-xs text-on-surface-variant">
          No releases yet. Upload the first package above.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-outline-variant rounded-lg border border-outline-variant bg-surface">
          {versions?.map((version) => {
            const remaining = remainingFor(version, now);
            const expired =
              version.state === "previous" && remaining !== null && remaining <= 0;
            const canRestore =
              version.canRestore && (remaining === null || remaining > 0);
            return (
              <li
                key={version.id}
                className={cn(
                  "flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between",
                  version.state === "current" && "bg-success/5"
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-body-sm font-semibold text-on-surface">
                    v{version.version}
                    <Badge tone={stateTone(version.state)}>{STATE_LABEL[version.state]}</Badge>
                    {version.state === "previous" && !expired && remaining !== null && (
                      <span className="font-body-xs font-normal text-warning">
                        {formatRemaining(remaining)}
                      </span>
                    )}
                    {expired && (
                      <span className="font-body-xs font-normal text-on-surface-variant">
                        {formatRemaining(remaining)}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-body-xs text-on-surface-variant">
                    {version.state === "current"
                      ? `Live for every invitation using this template${
                          version.publishedAt ? ` · published ${formatDateTime(version.publishedAt)}` : ""
                        }`
                      : version.state === "previous"
                        ? `Replaced ${formatDateTime(version.replacedAt)} · delete after ${formatDateTime(version.deleteAfter)}`
                        : version.state === "retired"
                          ? `Retired ${formatDateTime(version.retiredAt)}${
                              version.retirementReason ? ` · ${version.retirementReason}` : ""
                            }`
                          : version.state === "draft"
                            ? `Draft · created ${formatDateTime(version.publishedAt)} · not live`
                            : "Upload in progress"}
                  </p>
                  {version.state === "retired" && !version.retiredAt && version.retirementReason && (
                    <p className="mt-0.5 font-body-xs text-on-surface-variant">
                      {version.retirementReason}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {version.state !== "retired" && version.state !== "uploading" && (
                    <a
                      href={version.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 font-body-xs text-on-surface-variant hover:bg-surface-container"
                      title={`Preview v${version.version} with demo content`}
                    >
                      <Icon name="preview" size="xs" />
                      Preview
                    </a>
                  )}
                  {version.state === "draft" && (
                    <Button
                      type="button"
                      size="sm"
                      icon="publish"
                      loading={publishingId === version.id}
                      disabled={publishingId !== null}
                      onClick={() => void publish(version)}
                    >
                      Publish
                    </Button>
                  )}
                  {version.state === "previous" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      icon="how_to_reg"
                      disabled={!canRestore || rollingBack}
                      title={
                        canRestore
                          ? `Restore v${version.version} for all invitations`
                          : "This release is outside its restoration window"
                      }
                      onClick={() => {
                        setRollbackError(null);
                        setRollbackIssues([]);
                        setRestoreTarget(version);
                      }}
                    >
                      Restore This Version
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 font-body-xs text-on-surface-variant">
        Preview opens the admin-only version view. The active release, drafts and retained
        releases are previewable; retired releases are never served.{" "}
        {templateSlug ? `Template: ${templateSlug}.` : ""}
      </p>

      <Modal
        open={restoreTarget !== null}
        onClose={() => {
          if (!rollingBack) setRestoreTarget(null);
        }}
        title={
          restoreTarget ? `Restore v${restoreTarget.version}?` : "Restore previous version?"
        }
        icon="how_to_reg"
        size="md"
        blockBackdropClose={rollingBack}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoreTarget(null)}
              disabled={rollingBack}
            >
              Cancel
            </Button>
            <Button
              type="button"
              icon="how_to_reg"
              loading={rollingBack}
              onClick={() => void confirmRestore()}
            >
              Restore version
            </Button>
          </>
        }
      >
        {restoreTarget && (
          <div className="flex flex-col gap-4">
            <p className="font-body-sm text-on-surface">
              Restore <strong>v{restoreTarget.version}</strong> and switch every invitation using
              this template to it?
            </p>
            <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Version to restore</span>
                <span className="font-medium">v{restoreTarget.version}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Currently active</span>
                <span className="font-medium">
                  {current ? `v${current.version}` : "No published release"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Replaced on</span>
                <span className="font-medium">
                  {formatDateTime(restoreTarget.replacedAt)}
                </span>
              </div>
            </div>
            <p className="rounded-xl border border-warning/30 bg-warning/5 p-3 font-body-sm text-on-surface">
              All invitations using this template are repointed in one transaction. Their URLs,
              customer data, media, music, RSVP responses and settings stay exactly as they are.
              The package is checked for compatibility before anything changes; if that check
              fails, nothing is restored or deleted.
            </p>
            <p className="font-body-sm text-on-surface-variant">
              The rejected current version will be taken out of service immediately and its
              package files purged. If storage deletion fails, the retired record is kept for
              automatic retry and the invitations keep working on the restored release.
            </p>
            {rollbackError && (
              <div className="rounded-xl border border-error/30 bg-error/5 p-3">
                <p className="font-body-sm font-semibold text-error">{rollbackError}</p>
                {rollbackIssues.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {rollbackIssues.map((issue, index) => (
                      <li key={index} className="font-body-xs text-error">
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
