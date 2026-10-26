"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, EmptyState } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Select, TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";
import { formatDate } from "@/lib/utils";
import {
  INVITATION_STATUSES,
  hasActiveFilters,
  toQueryString,
  type InvitationFilters,
  type InvitationRow,
  type InvitationStatus,
} from "@/lib/services/admin-invitations";

const STATUS_TONE: Record<InvitationStatus, "success" | "warning" | "danger" | "default"> = {
  active: "success",
  draft: "default",
  expired: "warning",
  cancelled: "danger",
};

const EMAIL_TONE: Record<string, "success" | "danger" | "warning" | "default"> = {
  sent: "success",
  delivered: "success",
  failed: "danger",
  bounced: "danger",
  queued: "warning",
};

interface Props {
  initialRows: InvitationRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: InvitationFilters;
}

export function InvitationsManager({ initialRows, total, page, pageCount, filters }: Props) {
  const router = useRouter();
  // Deleted ids are tracked rather than the rows themselves, so the server
  // stays the source of truth and a refresh cannot resurrect a deleted row.
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<InvitationRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(
    () => initialRows.filter((r) => !deleted.has(r.id)),
    [initialRows, deleted]
  );

  // Filters live in the URL so a view is shareable/bookmarkable; the server
  // re-runs the query. The parent remounts this component when the query
  // string changes, so these initialize from props and need no syncing effect.
  const [draftQ, setDraftQ] = useState(filters.q);
  const [draftStatus, setDraftStatus] = useState<string>(filters.status);
  const [draftFrom, setDraftFrom] = useState(filters.from ?? "");
  const [draftTo, setDraftTo] = useState(filters.to ?? "");

  const apply = useCallback(
    (next: Partial<InvitationFilters>) => {
      const merged: InvitationFilters = {
        ...filters,
        q: "",
        status: "all",
        from: null,
        to: null,
        ...next,
        page: 1,
      };
      router.push(`/admin/invitations${toQueryString(merged)}`);
    },
    [filters, router]
  );

  const gotoPage = useCallback(
    (target: number) => {
      const clamped = Math.min(Math.max(1, target), pageCount);
      router.push(`/admin/invitations${toQueryString({ ...filters, page: clamped })}`);
    },
    [filters, pageCount, router]
  );

  const filtered = useMemo(() => hasActiveFilters(filters), [filters]);

  async function remove(row: InvitationRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/invitations/${row.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: row.slug ?? row.id }),
      });
      const json = (await res.json()) as { error?: string; objectsDeleted?: number };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");

      setDeleted((d) => new Set(d).add(row.id));
      setDeleting(null);
      setExpanded(null);
      toast(
        "Invitation deleted",
        `${json.objectsDeleted ?? 0} file${(json.objectsDeleted ?? 0) === 1 ? "" : "s"} removed`
      );
      // Refresh so totals and page bounds match the server.
      router.refresh();
    } catch (e) {
      toast("Delete failed", (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <form
        className="grid gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          apply({
            q: draftQ.trim(),
            status: (draftStatus as InvitationStatus) || "all",
            from: draftFrom || null,
            to: draftTo || null,
          });
        }}
      >
        <div className="sm:col-span-2">
          <TextInput
            label="Search"
            placeholder="Email, name or slug…"
            icon="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
          />
        </div>
        <Select
          label="Status"
          value={draftStatus}
          onChange={(e) => setDraftStatus(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            ...INVITATION_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <TextInput
          label="Created from"
          type="date"
          value={draftFrom}
          onChange={(e) => setDraftFrom(e.target.value)}
        />
        <TextInput
          label="Created to"
          type="date"
          value={draftTo}
          onChange={(e) => setDraftTo(e.target.value)}
        />

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit" icon="search">
            Apply filters
          </Button>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              icon="close"
              onClick={() => {
                setDraftQ("");
                setDraftStatus("all");
                setDraftFrom("");
                setDraftTo("");
                router.push("/admin/invitations");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon="mail"
          title={filtered ? "No invitations match these filters" : "No invitations yet"}
          description={
            filtered
              ? "Try a different email, status or date range."
              : "Invitations appear here once a guest completes checkout."
          }
          className="rounded-2xl border border-dashed border-outline-variant"
        />
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[980px] font-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-start font-body-xs uppercase tracking-wider text-on-surface-variant">
                <th className="py-2 pr-4 text-start font-semibold">Couple</th>
                <th className="py-2 pr-4 text-start font-semibold">Email</th>
                <th className="py-2 pr-4 text-start font-semibold">Template</th>
                <th className="py-2 pr-4 text-start font-semibold">Status</th>
                <th className="py-2 pr-4 text-start font-semibold">Ends</th>
                <th className="py-2 pr-4 text-start font-semibold">Created</th>
                <th className="py-2 pr-4 text-start font-semibold">Live link</th>
                <th className="py-2 text-start font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map((row) => {
                const isOpen = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr className={isOpen ? "bg-surface-container-low" : undefined}>
                      <td className="py-3 pr-4 align-top">
                        <p className="font-semibold !text-on-surface">{row.couple}</p>
                        <p className="font-body-xs text-on-surface-variant">
                          {row.mediaCount} file{row.mediaCount === 1 ? "" : "s"} · {row.rsvpCount} RSVP
                          {row.rsvpCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        {row.email ? (
                          <>
                            <p className="break-all !text-on-surface">{row.email}</p>
                            {row.emails.length > 0 && (
                              <p className="font-body-xs text-on-surface-variant">
                                {row.emails.filter((e) => e.status === "sent").length}/{row.emails.length} sent
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 align-top text-on-surface-variant">
                        {row.templateName ?? "—"}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                      </td>
                      <td className="py-3 pr-4 align-top text-on-surface-variant">
                        {row.expirationDate ? formatDate(row.expirationDate) : "—"}
                      </td>
                      <td className="py-3 pr-4 align-top text-on-surface-variant">{formatDate(row.createdAt)}</td>
                      <td className="py-3 pr-4 align-top">
                        {row.slug ? (
                          <a
                            href={`/w/${row.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-body-sm font-medium text-primary underline"
                          >
                            <Icon name="open_in_new" size="sm" /> /w/{row.slug}
                          </a>
                        ) : (
                          <span className="text-on-surface-variant">not published</span>
                        )}
                      </td>
                      <td className="py-3 align-top">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={isOpen ? "expand_less" : "expand_more"}
                            onClick={() => setExpanded(isOpen ? null : row.id)}
                            aria-label={isOpen ? "Hide email history" : "Show email history"}
                          >
                            {row.emails.length}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="delete"
                            className="!text-error"
                            onClick={() => setDeleting(row)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>

                  {/* Rendered as its own row inside the table so the panel
                      appears directly beneath the row it belongs to. */}
                  {isOpen && (
                    <tr>
                      <td colSpan={8} className="p-0 pb-3">
                        <EmailHistory row={row} onClose={() => setExpanded(null)} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 font-body-xs text-on-surface-variant">
        <p>
          Showing {rows.length} of {total} invitation{total === 1 ? "" : "s"}
          {filtered ? " (filtered)" : ""}
        </p>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon="arrow_back"
              disabled={page <= 1}
              onClick={() => gotoPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              iconAfter="arrow_forward"
              disabled={page >= pageCount}
              onClick={() => gotoPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <DeleteDialog
        // Remounting per row resets the typed confirmation without an effect.
        key={deleting?.id ?? "none"}
        row={deleting}
        busy={busyId === deleting?.id}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
      />
    </div>
  );
}

function EmailHistory({ row, onClose }: { row: InvitationRow; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-body-sm font-semibold !text-on-surface">
          Email history — {row.couple}
        </p>
        <Button variant="ghost" size="sm" icon="close" onClick={onClose} aria-label="Close email history">
          Close
        </Button>
      </div>

      {row.emails.length === 0 ? (
        <p className="mt-2 font-body-sm text-on-surface-variant">No email has been sent for this invitation.</p>
      ) : (
        <table className="mt-3 w-full font-body-sm">
          <thead>
            <tr className="border-b border-outline-variant text-start font-body-xs uppercase tracking-wider text-on-surface-variant">
              <th className="py-1.5 pr-4 text-start font-semibold">Template</th>
              <th className="py-1.5 pr-4 text-start font-semibold">To</th>
              <th className="py-1.5 pr-4 text-start font-semibold">Status</th>
              <th className="py-1.5 text-start font-semibold">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {row.emails.map((e, i) => (
              <tr key={`${e.templateKey}-${i}`}>
                <td className="py-2 pr-4 font-mono text-body-xs text-on-surface-variant">{e.templateKey}</td>
                <td className="py-2 pr-4 break-all !text-on-surface">{e.toEmail}</td>
                <td className="py-2 pr-4">
                  <Badge tone={EMAIL_TONE[e.status] ?? "default"}>{e.status}</Badge>
                </td>
                <td className="py-2 text-on-surface-variant">
                  {e.sentAt ? formatDate(e.sentAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DeleteDialog({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: InvitationRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  if (!row) return null;

  const expected = row.slug ?? row.id;
  const matches = typed.trim() === expected;

  return (
    <Modal
      open
      onClose={onCancel}
      title="Delete this invitation permanently?"
      icon="warning"
      size="md"
      blockBackdropClose={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon="delete" loading={busy} disabled={!matches} onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      <div className="space-y-3 font-body-sm text-on-surface-variant">
        <p>
          This removes <strong className="!text-on-surface">{row.couple}</strong> and immediately kills the live
          link
          {row.slug ? (
            <>
              {" "}
              <code className="break-all font-mono text-body-xs">/w/{row.slug}</code>
            </>
          ) : null}
          .
        </p>
        <p className="rounded-lg bg-error/10 px-3 py-2 text-error">
          This cannot be undone. All stored photos, galleries and music are deleted from storage, and the
          invitation record is erased along with its events, RSVPs and view history.
        </p>
        <p>
          Type <code className="break-all font-mono text-body-xs !text-on-surface">{expected}</code> to confirm.
        </p>
        <TextInput
          label="Confirmation"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={expected}
          autoComplete="off"
          disabled={busy}
        />
      </div>
    </Modal>
  );
}