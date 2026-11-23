"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/shared/Badge";
import { DeleteInvitationButton } from "@/components/account/DeleteInvitationButton";
import { toast } from "@/components/account/toast";
import { formatDate, cn } from "@/lib/utils";
import { formTypeOrDefault, isBirthdayForm, ordinal } from "@/lib/builder/forms";

export interface InvitationItem {
  id: string;
  slug: string;
  bride: string;
  groom: string;
  celebrant?: string;
  birthdayNumber?: number | null;
  formType?: string | null;
  date: string;
  venue: string;
  status: "draft" | "active" | "expired" | "cancelled";
  expiration: string | null;
  views: number;
  attending: number;
  templateName: string;
  url: string | null;
}

const statusTone: Record<InvitationItem["status"], "default" | "success" | "warning" | "danger"> = {
  active: "success",
  draft: "default",
  expired: "danger",
  cancelled: "warning",
};

export function InvitationsList({
  items,
  canDelete = false,
}: {
  items: InvitationItem[];
  /** Planners can permanently remove invitations they own. */
  canDelete?: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Remove locally after a delete so the rest of the list stays put.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const visibleItems = items.filter((item) => !deletedIds.has(item.id));

  async function copyLink(item: InvitationItem) {
    if (!item.url) return;
    await navigator.clipboard.writeText(item.url);
    setCopiedId(item.id);
    toast("Link copied", "Share it on WhatsApp or print it on cards.");
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (visibleItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant p-12 text-center">
        <Icon name="auto_awesome" size="xl" className="mx-auto text-on-surface-variant" weight="w200" />
        <h2 className="mt-4 font-heading-md font-semibold !text-on-surface">No invitations yet</h2>
        <p className="mt-1 font-body-sm text-on-surface-variant">
          Invitations you publish from your account will show up here with live guest stats.
        </p>
        <Link href="/create/browse" className="mt-5 inline-flex items-center gap-2">
          <Button icon="add_circle">Create your first invitation</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleItems.map((item) => {
        const formType = formTypeOrDefault(item.formType);
        const birthday = isBirthdayForm(formType);
        const couple = birthday
          ? item.celebrant?.trim() || "Birthday Star"
          : `${item.groom || "—"} & ${item.bride || "—"}`;
        const dateLine =
          birthday && typeof item.birthdayNumber === "number"
            ? `${ordinal(item.birthdayNumber)} Birthday`
            : item.date
              ? formatDate(item.date)
              : "date TBD";
        return (
          <div key={item.id} className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                  <Icon name="auto_awesome" size="lg" weight="w400" />
                </span>
                <div>
                  <h2 className="font-heading-md font-semibold !text-on-surface">{couple}</h2>
                  <p className="font-body-xs text-on-surface-variant">
                    {item.templateName} · {dateLine}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone[item.status]} icon={item.status === "active" ? "check_circle" : "info"}>
                  {item.status}
                </Badge>
                {item.expiration && <Badge tone="default">expires {formatDate(item.expiration)}</Badge>}
              </div>
            </div>

            {item.url && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface-container-lowest px-3 py-2">
                <Icon name="link" size="sm" className="text-on-surface-variant" />
                <code className="flex-1 truncate font-body-xs text-on-surface-variant">{item.url}</code>
                <button
                  type="button"
                  onClick={() => void copyLink(item)}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 font-body-xs font-semibold text-primary hover:bg-primary/10"
                >
                  <Icon name={copiedId === item.id ? "check" : "content_copy"} size="sm" /> {copiedId === item.id ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            {/* Live stats */}
            <div className={cn("mt-4 grid grid-cols-1 gap-2 sm:gap-3", birthday ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
              <StatCard label="Invitation views" value={item.views} icon="visibility" />
              {!birthday && <StatCard label="Confirmations" value={item.attending} icon="celebration" />}
              <StatCard label="Status" value={item.status === "active" && item.url ? "Live" : "Not live"} icon="public" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {item.status === "active" && item.url && (
                <Link href={item.url} target="_blank">
                  <Button variant="outline" size="sm" icon="visibility">View live</Button>
                </Link>
              )}
              <Link href={`/app/invitations/${item.id}`}>
                <Button variant={item.status === "active" ? "secondary" : "primary"} size="sm" icon="settings">
                  Manage invitation
                </Button>
              </Link>
              {item.status === "draft" && (
                <Link href={`/app/invitations/${item.id}/continue`}>
                  <Button variant="primary" size="sm" icon="arrow_forward">Continue & publish</Button>
                </Link>
              )}
              {canDelete && (
                <DeleteInvitationButton
                  weddingId={item.id}
                  couple={couple}
                  confirmValue={item.slug || item.id}
                  onDeleted={() => setDeletedIds((ids) => new Set(ids).add(item.id))}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: "visibility" | "celebration" | "public" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 sm:block sm:py-3">
      <p className="flex items-center gap-1.5 font-body-xs text-on-surface-variant">
        <Icon name={icon} size="sm" className="!text-[14px] text-secondary" /> {label}
      </p>
      <p className="font-heading-sm !text-on-surface sm:mt-1 sm:font-heading-md">{value}</p>
    </div>
  );
}