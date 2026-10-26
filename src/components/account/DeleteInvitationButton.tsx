"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { TextInput } from "@/components/shared/Field";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";

interface Props {
  weddingId: string;
  couple: string;
  /** Live slug, or the id when the invitation has not got a slug yet. */
  confirmValue: string;
  label?: string;
  /** Navigate here after a successful delete (e.g. back to the list). */
  redirectTo?: string;
  /** Local list update; the page itself does not need a refresh. */
  onDeleted?: () => void;
}

/**
 * Planner-only destructive action. The API re-checks the role and ownership;
 * this dialog just prevents an accidental click with a typed confirmation.
 */
export function DeleteInvitationButton({
  weddingId,
  couple,
  confirmValue,
  label = "Delete",
  redirectTo,
  onDeleted,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = typed.trim() === confirmValue;

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const json = (await res.json()) as { error?: string; objectsDeleted?: number };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");

      setOpen(false);
      setTyped("");
      toast(
        "Invitation deleted",
        `${json.objectsDeleted ?? 0} stored file${(json.objectsDeleted ?? 0) === 1 ? "" : "s"} removed.`
      );
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
      } else if (!onDeleted) {
        router.refresh();
      }
    } catch (err) {
      toast("Delete failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="danger"
        size="sm"
        icon="delete"
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
      >
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setTyped("");
          }
        }}
        title="Delete this invitation permanently?"
        icon="warning"
        blockBackdropClose={busy}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              icon="delete"
              loading={busy}
              disabled={!matches}
              onClick={() => void remove()}
            >
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-3 font-body-sm text-on-surface-variant">
          <p>
            This removes <strong className="!text-on-surface">{couple}</strong> and immediately kills the live
            link.
          </p>
          <p className="rounded-lg bg-error/10 px-3 py-2 text-error">
            This cannot be undone. All stored photos, galleries and music are deleted, and the invitation
            record is erased along with its events, RSVPs and view history.
          </p>
          <p>
            Type <code className="break-all font-mono text-body-xs !text-on-surface">{confirmValue}</code> to confirm.
          </p>
          <TextInput
            label="Confirmation"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmValue}
            autoComplete="off"
            disabled={busy}
          />
        </div>
      </Modal>
    </>
  );
}
