"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/shared/Icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: IconName;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  hideHeader?: boolean;
  footer?: React.ReactNode;
  blockBackdropClose?: boolean;
  className?: string;
}

// Width caps only apply from `sm` up: on phones the panel is a full-width
// bottom sheet, so it sits flush with both viewport edges.
const sizes = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

// Client-only flag without a setState-in-effect (which React's lint rules
// flag): the server snapshot is false, the client snapshot is true.
const subscribeToNothing = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function Modal({ open, onClose, title, icon, children, size = "md", hideHeader = false, footer, blockBackdropClose = false, className }: ModalProps) {
  const mounted = useSyncExternalStore(subscribeToNothing, getClientSnapshot, getServerSnapshot);

  const closeOnEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, closeOnEscape]);

  if (!open || !mounted) return null;

  // Portal to <body>: cards, tables and animated shells can create a
  // containing block (transform/filter) or clip descendants, which made the
  // fixed overlay align to the card instead of the mobile viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex h-[100dvh] items-center justify-center overflow-hidden bg-black/50 px-4 pt-[calc(1rem_+_env(safe-area-inset-top))] pb-[calc(1rem_+_env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!blockBackdropClose) onClose();
      }}
    >
      <div
        className={cn(
          // Center the dialog with breathing room above and below on phones;
          // `max-h-full` keeps it inside the padded viewport, and `min-h-0`
          // lets the body scroll instead of pushing the footer off-screen.
          "flex max-h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl",
          sizes[size],
          "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-8 sm:slide-in-from-bottom-0",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-2">
              {icon && <Icon name={icon} size="md" className="shrink-0 text-primary" />}
              <h2 className="min-w-0 text-balance font-heading-md font-semibold text-on-surface">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-highest focus:outline-none focus-visible:outline-2"
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        )}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-5",
            !footer && "pb-4"
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline-variant bg-surface-container-low px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
