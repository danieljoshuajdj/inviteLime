"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/shared/Icon";
import { LogoLink } from "@/components/shared/Logo";
import { ToastHost, type ToastMessage } from "@/components/shared/Toast";
import { buildStepper } from "@/components/builder/step-config";
import { StepDetails } from "@/components/builder/StepDetails";
import { StepPreview } from "@/components/builder/StepPreview";
import { StepReview } from "@/components/builder/StepReview";
import {
  normalizeWeddingData,
  weddingDataForDb,
  type WeddingData,
} from "@/lib/builder/defaults";

export interface BuilderProps {
  token: string;
  initialData: WeddingData;
  draftEmail: string | null;
  template: {
    id: string;
    name: string;
    slug: string;
    pricePaise: number;
    /** ISO-4217 currency the price is denominated in (geo-detected). */
    currency: string;
    versionId: string;
  };
  /** Present only when this draft belongs to a planner account. */
  planner?: {
    active: boolean;
    canCreate: boolean;
    planName: string | null;
    remaining: number | null;
    limit: number | null;
    brandName: string | null;
    brandComplete: boolean;
    reason: string;
  } | null;
  /** Dev-only: enables the "publish without paying" shortcut in StepReview. */
  devBypassEnabled?: boolean;
}

const AUTO_SAVE_MS = 2500;

export function BuilderHost({
  token,
  initialData,
  draftEmail,
  template,
  planner,
  devBypassEnabled,
}: BuilderProps) {
  const [step, setStep] = useState(0);
  /**
   * Furthest step actually advanced *through* the flow — never by clicking the
   * bar. Ticks and the clickable range are keyed off this rather than `step`,
   * so jumping back and forth neither forges ticks nor lets you skip ahead.
   */
  const [reached, setReached] = useState(0);
  const [data, setData] = useState<WeddingData>(() => normalizeWeddingData(initialData));
  const [email, setEmail] = useState<string | null>(draftEmail);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [dirty, setDirty] = useState(false);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const steps = buildStepper(data, data.formType);

  const pushToast = useCallback((kind: ToastMessage["kind"], title: string, description?: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, kind, title, description }]);
  }, []);

  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  const save = useCallback(
    async (payload = dataRef.current, opts: { silent?: boolean } = {}) => {
      try {
        const res = await fetch("/api/guest/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            templateId: template.id,
            templateVersionId: template.versionId,
            weddingData: weddingDataForDb(payload),
            email,
          }),
        });
        const json = (await res.json()) as { draft?: unknown; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Autosave failed");
        setDirty(false);
        if (!opts.silent) pushToast("success", "Saved", "Your progress is safe.");
        return true;
      } catch (err) {
        if (!opts.silent) {
          pushToast("error", "Could not autosave", (err as Error).message);
        }
        return false;
      }
    },
    [token, template.id, template.versionId, email, pushToast]
  );

  // Autosave on changes.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void save(dataRef.current, { silent: true }), AUTO_SAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, save]);

  // Each step starts at the top of the page. Steps keep the window's scroll
  // position otherwise, so landing on a new step could drop you mid-form.
  // Skipped on first paint so a restored scroll position isn't stolen.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  /**
   * Accepts a patch, or an updater for changes that depend on the previous
   * value. List appends must use the updater form: two gallery uploads landing
   * at once would otherwise each write their own stale copy of `gallery`, and
   * the second write would erase the first.
   */
  function update(patch: Partial<WeddingData> | ((prev: WeddingData) => Partial<WeddingData>)) {
    setData((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
    setDirty(true);
  }

  /**
   * Jump to a step you have already reached (stepper clicks, Back buttons).
   * Clamped to `reached` rather than to the step count: the `disabled` attribute
   * on unreached stepper buttons is only a hint, and anything that strips it
   * (browser extensions, automation scripts) must not unlock later steps.
   */
  function goTo(index: number) {
    setStep(Math.max(0, Math.min(index, reached)));
  }

  /** You may click any step you have already reached; never one past it. */
  function canJumpTo(index: number) {
    return index <= reached;
  }

  /** Forward navigation is the only path that opens up a new step. */
  function advance() {
    const next = Math.min(step + 1, steps.length - 1);
    setStep(next);
    setReached((r) => Math.max(r, next));
  }

  async function goNext() {
    if (step < steps.length - 1) {
      const ok = await save(dataRef.current, { silent: true });
      // `save` only fails on a transport/server error — field validation happens
      // per step inside each Step* component. Don't blame the fields.
      if (!ok) pushToast("error", "Could not save your progress", "Check your connection and try again.");
      advance();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <ToastHost toasts={toasts} onDismiss={dismissToast} />

      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-outline-variant bg-surface/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <LogoLink href="/" height={34} />
        </div>
        <span className="hidden items-center gap-1.5 font-body-xs font-medium text-on-surface-variant sm:flex">
          <Icon name="auto_awesome" size="sm" className="text-secondary" />
          {template.name}
        </span>
      </header>

      {/* Stepper */}
      <nav aria-label="Progress" className="border-b border-outline-variant bg-surface">
        <ol className="mx-auto flex max-w-4xl items-start overflow-x-auto px-4 py-3 sm:px-6">
          {steps.map((s, i) => {
            // Reached *and* actually satisfied: clicking ahead used to tick
            // every step before it because this was just `i < step`.
            const isDone = i < reached && s.complete;
            const isCurrent = i === step;
            const reachable = canJumpTo(i);
            // The connector belongs to the segment before this step. It is
            // green only when the previous step was actually completed.
            const previousDone = i > 0 && i - 1 < reached && steps[i - 1].complete;
            return (
              <li key={s.id} className="relative flex flex-1 flex-col items-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={
                      "absolute right-1/2 top-4 h-px w-full transition-colors " +
                      (previousDone ? "bg-success" : "bg-outline")
                    }
                  />
                )}
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  disabled={!reachable}
                  title={reachable ? undefined : "Finish the previous steps first"}
                  className={
                    "relative z-10 flex flex-col items-center gap-1.5 transition-opacity " +
                    (reachable ? "" : "cursor-not-allowed opacity-40")
                  }
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span
                    className={
                      "flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-colors " +
                      (isDone
                        ? "bg-success text-white"
                        : isCurrent
                        ? "bg-primary text-on-primary ring-4 ring-primary/20"
                        : "bg-surface-container-highest text-on-surface-variant")
                    }
                  >
                    {isDone ? <Icon name="check" size="sm" /> : i + 1}
                  </span>
                  <span
                    className={
                      "hidden max-w-[9rem] text-center font-body-xs font-semibold lg:block " +
                      (isCurrent ? "text-on-surface" : "text-on-surface-variant")
                    }
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step body */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {step === 0 && (
          <StepDetails token={token} data={data} onChange={update} onNext={goNext} />
        )}
        {step === 1 && (
          <StepPreview
            token={token}
            data={data}
            template={template}
            onBack={() => goTo(0)}
            onNext={goNext}
          />
        )}
        {step === 2 && (
          <StepReview
            token={token}
            data={data}
            email={email}
            onEmailChange={setEmail}
            template={template}
            onBack={() => goTo(1)}
            onSaved={() => save(dataRef.current, { silent: true })}
            planner={planner}
            devBypassEnabled={devBypassEnabled}
          />
        )}
      </main>

      {/* Bottom padding for mobile CTA */}
      <div className="h-6" />
    </div>
  );
}