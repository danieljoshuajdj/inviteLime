"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/shared/Badge";
import { InfiniteScrollFooter } from "@/components/shared/InfiniteScrollFooter";
import { useInfiniteReveal } from "@/lib/use-infinite-reveal";

export interface PickerTemplate {
  slug: string;
  name: string;
  description?: string | null;
  priceLabel: string;
  thumbnailUrl?: string | null;
  categories?: string[];
}

/**
 * Template gallery for `/create/browse`. Cards start a guest session directly;
 * there is no separate "select then continue" step to get through.
 */
export function TemplatePicker({ templates }: { templates: PickerTemplate[] }) {
  const router = useRouter();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTemplates = templates.filter((t) => {
    if (!normalizedQuery) return true;
    return (
      t.name.toLowerCase().includes(normalizedQuery) ||
      (t.description ?? "").toLowerCase().includes(normalizedQuery) ||
      (t.categories ?? []).some((category) => category.toLowerCase().includes(normalizedQuery))
    );
  });

  const {
    visibleItems: visibleTemplates,
    hasMore,
    loading,
    loadMore,
  } = useInfiniteReveal(filteredTemplates, normalizedQuery);

  async function startCreating(slug: string) {
    if (pendingSlug) return;
    setPendingSlug(slug);
    setError(null);
    try {
      const res = await fetch("/api/guest/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const json = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !json.token) throw new Error(json.error ?? "Could not start a session.");
      router.push(`/create/${json.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a session. Try again.");
      setPendingSlug(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Icon
            name="search"
            size="sm"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-500"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates by name, style, or occasion…"
            aria-label="Search templates"
            type="text"
            className="w-full rounded-full border border-navy-300 bg-ivory-50 py-3 pl-11 pr-10 font-body-sm text-navy-950 shadow-sm placeholder:text-navy-400 focus:border-sapphire-600 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-navy-500 transition-colors hover:bg-ivory-200 hover:text-navy-950"
            >
              <Icon name="close" size="sm" />
            </button>
          )}
        </div>
        <p className="font-body-xs text-navy-700">
          Showing {filteredTemplates.length} template{filteredTemplates.length === 1 ? "" : "s"}
        </p>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-navy-300 bg-ivory-50 p-12 text-center">
          <Icon name="search" size="xl" className="mx-auto text-navy-400" />
          <p className="mt-4 font-heading-sm font-semibold text-ivory-950">No templates match your search</p>
          <p className="mt-1 font-body-sm text-navy-700">Try a different word, style, or occasion.</p>
          <Button variant="outline" size="sm" icon="refresh" className="mt-4" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTemplates.map((t) => {
              const pending = pendingSlug === t.slug;
              const busy = pendingSlug !== null;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => void startCreating(t.slug)}
                  disabled={busy}
                  aria-busy={pending || undefined}
                  aria-label={`Start with ${t.name}`}
                  className="group relative overflow-hidden rounded-2xl border-2 border-navy-200 bg-ivory-50 text-start shadow-sm transition-all hover:border-navy-400 hover:shadow-md disabled:cursor-wait disabled:opacity-80"
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-sapphire-50">
                    {t.thumbnailUrl ? (
                      <img src={t.thumbnailUrl} alt={t.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sapphire-100 via-rose-50 to-gold-100">
                        <Icon name="auto_awesome" size="2xl" weight="w200" className="text-navy-400/60" />
                      </div>
                    )}
                    <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-navy-200 bg-ivory-50">
                      <Icon
                        name={pending ? "refresh" : "north_east"}
                        size="sm"
                        className={pending ? "animate-spin text-gold-600" : "text-navy-500"}
                      />
                    </div>
                    {t.categories && t.categories.length > 0 && (
                      <div className="absolute bottom-3 left-3">
                        <Badge tone="primary" className="!bg-ivory-50">{t.categories[0]}</Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-4">
                    <div>
                      <h3 className="font-heading-sm font-semibold text-ivory-950">{t.name}</h3>
                      <p className="mt-0.5 font-body-xs text-navy-700">{t.priceLabel}</p>
                    </div>
                    <Icon
                      name={pending ? "check_circle" : "auto_awesome"}
                      size="md"
                      className={pending ? "text-gold-600" : "text-navy-400"}
                      filled={pending}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <InfiniteScrollFooter hasMore={hasMore} loading={loading} onLoadMore={loadMore} />
        </>
      )}

      {error && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          <Icon name="error" size="sm" /> {error}
        </p>
      )}

      <p className="mt-6 text-center font-body-xs text-navy-700">
        Pick a template to start personalizing. It is free until you publish.
      </p>
    </div>
  );
}
