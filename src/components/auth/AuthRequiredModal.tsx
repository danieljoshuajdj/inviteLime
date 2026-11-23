"use client";

import { useState } from "react";

import { Logo } from "@/components/shared/Logo";
import { Modal } from "@/components/shared/Modal";
import { Icon } from "@/components/shared/Icon";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Exact builder path to open after sign-in. */
  next: string;
}

/**
 * Shown when a visitor who is not signed in asks to create or customise a
 * template. Signing in continues through Google and returns them to the exact
 * template they chose; the modal never creates a draft itself.
 */
export function AuthRequiredModal({ open, onClose, next }: Props) {
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} hideHeader size="sm">
      {/* Compact by default so the panel stays comfortable down to a 300px
          viewport, then returns to the original scale from `sm` up. */}
      <div className="flex min-w-0 flex-col items-center gap-4 py-1 text-center sm:gap-5 sm:py-2">
        <Logo height={34} priority />

        <div className="min-w-0">
          <h2 className="font-heading-xl !text-[clamp(1.25rem,5.5vw,2.75rem)] text-balance text-ivory-950">
            Sign in to continue
          </h2>
          <p className="mx-auto mt-1.5 max-w-[34ch] font-body-xs leading-relaxed text-navy-700 sm:mt-2 sm:font-body-sm">
            Sign in with Google to create and customize your templates.
          </p>
        </div>

        {error && (
          <p
            className="flex w-full items-center gap-2 rounded-lg bg-error/10 px-3 py-2 text-start font-body-xs text-error sm:font-body-sm"
            role="alert"
          >
            <Icon name="error" size="sm" /> {error}
          </p>
        )}

        <GoogleSignInButton
          next={next}
          onError={(message) => setError(message || null)}
          className="w-full !px-4 !text-[15px] border-navy-200 bg-white text-navy-900 hover:bg-ivory-100 sm:!px-6 sm:!text-[18px]"
        />

        <button
          type="button"
          onClick={close}
          className="min-h-11 rounded-full px-3 py-2 font-body-xs font-medium text-navy-600 hover:text-navy-950 hover:underline"
        >
          Not now
        </button>
      </div>
    </Modal>
  );
}
