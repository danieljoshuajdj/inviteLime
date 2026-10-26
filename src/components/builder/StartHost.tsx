"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Four dots that rise and fall in sequence — shown while the studio boots.
 */
function LoadingDots() {
  return (
    <div className="flex h-6 items-end gap-1.5" role="status" aria-label="Opening your studio">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 animate-dot-wave rounded-full bg-gold-500 motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/**
 * Starts a guest studio directly for a chosen template.
 *
 * The old "pick a template or skip it" chooser was removed: generic creation
 * now begins on the template library, while template CTAs deep-link here and
 * skip straight into the builder.
 */
export function StartHost({ initialTemplateSlug }: { initialTemplateSlug: string }) {
  const router = useRouter();
  const [startError, setStartError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/guest/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: initialTemplateSlug }),
        });
        const json = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !json.token) throw new Error(json.error ?? "Could not open this template.");
        router.replace(`/create/${json.token}`);
      } catch (err) {
        setStartError(err instanceof Error ? err.message : "Could not open this template.");
      }
    })();
  }, [initialTemplateSlug, router]);

  if (startError) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
        <p className="max-w-md rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          {startError}
        </p>
        <Link
          href="/create/browse"
          className="inline-flex h-11 items-center justify-center rounded-full bg-ivory-950 px-6 font-body-sm font-semibold text-ivory-50 transition-transform hover:scale-[1.02]"
        >
          Browse templates
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
      <LoadingDots />
      <p className="font-heading-md text-ivory-950">Opening your studio…</p>
      <p className="font-body-sm text-navy-700">Setting up your chosen template.</p>
    </div>
  );
}
