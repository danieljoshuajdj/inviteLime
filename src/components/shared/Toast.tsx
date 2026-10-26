"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/shared/Icon";

export interface ToastMessage {
  id: number;
  kind: "success" | "error" | "info" | "loading";
  title: string;
  description?: string;
}

export function ToastHost({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          toast={t}
          onDismiss={() => onDismiss(t.id)}
          autoDismiss={t.kind !== "loading"}
        />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss, autoDismiss = true }: { toast: ToastMessage; onDismiss: () => void; autoDismiss?: boolean }) {
  useEffect(() => {
    if (!autoDismiss) return;
    const timer = setTimeout(onDismiss, toast.kind === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast.id, autoDismiss, onDismiss, toast.kind]);

  const icon: Record<ToastMessage["kind"], IconName> = {
    success: "check_circle",
    error: "error",
    info: "info",
    loading: "refresh",
  };

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 text-start shadow-lg backdrop-blur",
        toast.kind === "success" && "border-success/40 bg-success/10 text-on-surface",
        toast.kind === "error" && "border-error/40 bg-error/10 text-on-surface",
        toast.kind === "info" && "border-primary/30 bg-surfac/90 text-on-surface",
        toast.kind === "loading" && "border-outline bg-surface/90 text-on-surface",
        "animate-in fade-in slide-in-from-top-2"
      )}
    >
      <Icon
        name={icon[toast.kind]}
        size="sm"
        className={cn(
          "mt-0.5 shrink-0",
          toast.kind === "success" && "text-success",
          toast.kind === "error" && "text-error",
          toast.kind === "info" && "text-primary",
          toast.kind === "loading" && "animate-spin text-on-surface-variant"
        )}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-body-sm font-bold text-on-surface">{toast.title}</span>
        {toast.description && (
          <span className="font-body-xs text-on-surface-variant">{toast.description}</span>
        )}
      </span>
    </button>
  );
}