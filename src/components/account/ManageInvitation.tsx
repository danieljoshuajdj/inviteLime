"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/shared/Badge";
import { Modal } from "@/components/shared/Modal";
import { Toggle } from "@/components/shared/Field";
import { DownloadQrCardButton } from "@/components/account/DownloadQrCardButton";
import { DeleteInvitationButton } from "@/components/account/DeleteInvitationButton";
import { toast } from "@/components/account/toast";
import { formDefinition, formTypeOrDefault, isBirthdayForm } from "@/lib/builder/forms";
import { cn } from "@/lib/utils";

export interface InvitationDetail {
  id: string;
  slug: string;
  couple: string;
  date: string;
  venue: string;
  status: string;
  templateName: string;
  formType?: string | null;
  views: number;
  attendingCount: number;
  rsvpCount: number;
  url: string | null;
  rsvpToggle: boolean;
}

export interface RsvpRow {
  name: string;
  email: string | null;
  phone: string | null;
  attendance: string;
  guests: number;
  dietary: string | null;
  message: string | null;
  createdAt: string;
}

export function ManageInvitation({
  invitation,
  rsvps,
  canDelete = false,
}: {
  invitation: InvitationDetail;
  rsvps: RsvpRow[];
  /** Planners can permanently remove invitations they own. */
  canDelete?: boolean;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [rsvpToggle, setRsvpToggle] = useState(invitation.rsvpToggle);
  const [toggling, setToggling] = useState(false);
  const [resending, setResending] = useState(false);

  const formType = formTypeOrDefault(invitation.formType);
  const definition = formDefinition(formType);
  const birthday = isBirthdayForm(formType);

  async function updateRsvp(value: boolean) {
    setToggling(true);
    setRsvpToggle(value);
    try {
      await fetch(`/api/weddings/${invitation.id}/rsvp-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: value }),
      });
    } catch {
      setRsvpToggle(!value);
      toast("Could not update RSVP setting");
    } finally {
      setToggling(false);
    }
  }

  async function resendEmail() {
    setResending(true);
    try {
      const res = await fetch(`/api/weddings/${invitation.id}/resend-email`, { method: "POST" });
      const json = (await res.json()) as { error?: string; sentTo?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not resend the invitation email");
      toast(`Invitation link re-sent to ${json.sentTo ?? "your inbox"}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not resend the invitation email");
    } finally {
      setResending(false);
    }
  }

  const waLines = [
    `${definition.invitationLabel} — ${invitation.couple}`,
    invitation.date,
    invitation.venue,
    invitation.url ?? "",
    "Tap to open your invitation 💌",
  ].filter((line) => line.trim() !== "");
  const waText = `${encodeURIComponent(waLines.join("\n"))}`;
  const waLink = `https://wa.me/?text=${waText}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">{invitation.templateName}</p>
          <h1 className="mt-1 font-heading-3xl !text-on-surface">{invitation.couple}</h1>
          <p className="mt-1 font-body text-on-surface-variant">
            {[invitation.date, invitation.venue].filter(Boolean).join(" · ") || "Details coming soon"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={invitation.status === "active" ? "success" : "default"} icon={invitation.status === "active" ? "check_circle" : "info"}>
            {invitation.status}
          </Badge>
          <Button variant="outline" size="sm" icon="share" onClick={() => setShareOpen(true)}>
            Share
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className={cn("mt-6 grid grid-cols-1 gap-2.5 sm:gap-3", birthday ? "sm:grid-cols-1" : "sm:grid-cols-3")}>
        <Stat label="Invitation views" value={invitation.views} icon="visibility" />
        {!birthday && <Stat label="Attending guests" value={invitation.attendingCount} icon="celebration" />}
        {!birthday && <Stat label="Responses" value={invitation.rsvpCount} icon="group" />}
      </div>

      {/* Controls */}
      <div className="mt-6 rounded-2xl border border-outline-variant bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading-md font-semibold !text-on-surface">Quick actions</h2>
            <p className="font-body-xs text-on-surface-variant">Manage how guests interact with your invitation.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {invitation.url && (
              <>
                <Button variant="outline" size="sm" icon="edit"
                  onClick={() => {
                    void navigator.clipboard.writeText(invitation.url!);
                    toast("Link copied");
                  }}
                >
                  Copy link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon="send"
                  disabled={resending}
                  onClick={() => void resendEmail()}
                >
                  {resending ? "Sending…" : "Resend email"}
                </Button>
                <DownloadQrCardButton
                  url={invitation.url}
                  couple={invitation.couple}
                  date={invitation.date}
                  venue={invitation.venue}
                  slug={invitation.slug}
                />
              </>
            )}
            <Link href={`/app/invitations/${invitation.id}/edit`} className="inline-flex">
              <Button size="sm" icon="settings">Edit content</Button>
            </Link>
            {!birthday && <Button variant="danger" size="sm" icon="download">Export RSVPs</Button>}
            {canDelete && (
              <DeleteInvitationButton
                weddingId={invitation.id}
                couple={invitation.couple}
                confirmValue={invitation.slug || invitation.id}
                redirectTo="/app/invitations"
              />
            )}
          </div>
        </div>

        {!birthday && (
          <div className="mt-5 border-t border-outline-variant pt-5">
            <Toggle
              label="Accept new RSVPs"
              description="Turns the RSVP form on the published invitation on or off."
              checked={rsvpToggle}
              disabled={toggling}
              onChange={(v) => void updateRsvp(v)}
            />
          </div>
        )}
      </div>

      {/* RSVP roster */}
      {!birthday && (
        <div className="mt-6 rounded-2xl border border-outline-variant bg-surface p-5">
          <h2 className="font-heading-md font-semibold !text-on-surface">Guest responses</h2>
          {rsvps.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-8 text-center font-body-sm text-on-surface-variant">
              No responses yet. Share your invitation to start collecting confirmations.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-start font-body-sm">
                <thead>
                  <tr className="border-b border-outline-variant text-start font-body-xs uppercase tracking-wider text-on-surface-variant">
                    <th className="py-2 pr-4 text-start font-semibold">Guest</th>
                    <th className="py-2 pr-4 text-start font-semibold">Response</th>
                    <th className="py-2 pr-4 text-start font-semibold">Guests</th>
                    <th className="py-2 text-start font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {rsvps.map((r, i) => (
                    <tr key={i}>
                      <td className="py-3 pr-4">
                        <p className="font-semibold !text-on-surface">{r.name}</p>
                        {r.email && <p className="font-body-xs text-on-surface-variant">{r.email}</p>}
                        {r.phone && <p className="font-body-xs text-on-surface-variant">{r.phone}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={r.attendance === "attending" ? "success" : "danger"}>
                          {r.attendance === "attending" ? "Attending" : "Declined"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-on-surface">{r.guests}</td>
                      <td className="py-3 text-on-surface-variant">
                        {r.dietary ? `Dietary: ${r.dietary}` : r.message ? <em>“{r.message}”</em> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share invitation" icon="share">
        <div className="flex flex-col gap-3">
          <p className="font-body-sm text-on-surface-variant">
            Send a personal WhatsApp invitation with each guest&apos;s name, or copy the reserved link for your invitation card.
          </p>
          {invitation.url && (
            <code className="break-all rounded-xl bg-surface-container-lowest px-3 py-2 font-body-xs">{invitation.url}</code>
          )}
          <a href={invitation.url ? waLink : "#"} target="_blank" rel="noopener noreferrer" className={invitation.url ? "block" : "pointer-events-none opacity-50"}>
            <Button fullWidth icon="send" variant="secondary">Send WhatsApp invitation</Button>
          </a>
          {invitation.url && typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <Button
              fullWidth
              variant="outline"
              icon="share"
              onClick={() => {
                void navigator
                  .share({ title: `${definition.invitationLabel} — ${invitation.couple}`, url: invitation.url! })
                  .catch(() => {});
              }}
            >
              Share with device
            </Button>
          )}
          {invitation.url && (
            <Button
              fullWidth
              variant="outline"
              icon="content_copy"
              onClick={() => {
                void navigator.clipboard.writeText(invitation.url!);
                toast("Link copied to clipboard");
              }}
            >
              Copy reservation link
            </Button>
          )}
          {!invitation.url && (
            <p className="rounded-xl bg-warning/15 p-3 font-body-xs text-warning-strong">
              This invitation is not live yet. Publish it (step 4 of the builder) to unlock sharing.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: "visibility" | "celebration" | "group" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface px-3 py-2.5 sm:block sm:rounded-2xl sm:p-4">
      <p className="flex items-center gap-1.5 font-body-xs text-on-surface-variant">
        <Icon name={icon} size="sm" className="!text-[14px] text-secondary" /> {label}
      </p>
      <p className="font-heading-md !text-on-surface sm:mt-1 sm:font-heading-xl">{value}</p>
    </div>
  );
}