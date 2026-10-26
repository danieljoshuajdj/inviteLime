"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { TemplateFrame } from "@/components/runtime/TemplateFrame";
import { weddingDataForDb, type WeddingData } from "@/lib/builder/defaults";

interface Props {
  token: string;
  data: WeddingData;
  template: { id: string; name: string; slug: string; pricePaise: number; versionId: string };
  onBack: () => void;
  onNext: () => void;
}

interface PreviewResult {
  html?: string;
  payload?: unknown;
  error?: string;
}

const DEBOUNCE_MS = 500;

export function StepPreview({ token, data, template, onBack, onNext }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/guest/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            templateId: template.id,
            templateVersionId: template.versionId,
            weddingData: weddingDataForDb(data),
          }),
        });
        const json = (await res.json()) as PreviewResult;
        if (cancelled) return;
        if (!res.ok || !json.html) throw new Error(json.error ?? "Could not prepare the preview.");
        setHtml(json.html);
        setPayload(json.payload ?? null);
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not prepare the preview.");
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, template.id, template.versionId, data, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <section aria-labelledby="step-preview-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            <Icon name="visibility" size="sm" /> Step 2 · Your live preview
          </p>
          <h1 id="step-preview-title" className="mt-2 font-heading-2xl !text-on-surface">
            This is how your invitation looks
          </h1>
          <p className="mt-2 font-body text-on-surface-variant">
            Every name, date, venue and photo you entered, rendered inside the {template.name} design.
            Nothing is published — when you move on you can still change everything.
          </p>
        </div>
        {template.pricePaise > 0 && (
          <span className="font-body-sm font-semibold text-primary">Free until you publish</span>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-outline-variant bg-ivory-950 shadow-xl">
        {status === "error" ? (
          <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-ivory-100">
            <Icon name="error" size="2xl" className="text-gold-300" />
            <h2 className="font-heading-md !text-ivory-50">The preview is not ready yet</h2>
            <p className="max-w-md font-body-sm text-ivory-300">
              {error ?? "We could not render this template right now."}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button icon="refresh" onClick={retry}>
                Try again
              </Button>
            </div>
          </div>
        ) : status === "ready" && html ? (
          <TemplateFrame
            html={html}
            payload={payload}
            title={`${template.name} — preview`}
            fallbackHref={`/templates/${template.slug}/demo`}
            fallbackLabel="Open template demo"
            className="relative bg-ivory-950"
          />
        ) : (
          <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 bg-ivory-950 text-ivory-200">
            <Icon name="refresh" size="lg" className="animate-spin text-gold-300" />
            <p className="font-body-sm">Preparing your preview…</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="lg" icon="arrow_back" iconAfter={undefined} onClick={onBack}>
          Back
        </Button>
        <Button size="xl" icon="rocket_launch" onClick={onNext}>
          Preview & publish
        </Button>
      </div>
    </section>
  );
}