"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { Icon } from "@/components/shared/Icon";
import { InfiniteScrollFooter } from "@/components/shared/InfiniteScrollFooter";
import { TemplateCard } from "@/components/public/TemplateCard";
import { createBrowserClient } from "@/lib/supabase/client";
import { useInfiniteReveal } from "@/lib/use-infinite-reveal";

export interface MarketTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceLabel: string;
  priceSuffix?: string;
  thumbnailUrl: string | null;
  categories: string[];
}

const FAVORITES_FILTER = "Favourites";

export function TemplatesMarketplace({
  templates,
  categories,
}: {
  templates: MarketTemplate[];
  /** Admin-managed category names, rendered as filter chips after "All". */
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [userId, setUserId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // Chips mirror the admin-managed `categories` table instead of a hardcoded
  // list. Names are trimmed and de-duplicated; a category colliding with the
  // "All" or favourites chips — which are rendered separately — is skipped so
  // the row cannot show two identical filters. Order is the caller's (the
  // page sorts by name), which keeps SSR and hydration identical.
  const categoryFilters = useMemo(() => {
    const seen = new Set<string>();
    for (const raw of categories) {
      const name = raw.trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (lower === "all" || lower === FAVORITES_FILTER.toLowerCase()) continue;
      seen.add(name);
    }
    return ["All", ...Array.from(seen)];
  }, [categories]);

  // Saved templates live in `favorite_templates`, which is owner-only under RLS,
  // so the signed-in customer's set is read in the browser. Signed-out visitors
  // get an empty set plus a prompt to sign in — nothing is stored locally.
  useEffect(() => {
    let active = true;
    const supabase = createBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      setUserId(user?.id ?? null);
      if (!user) {
        setFavoritesLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("favorite_templates")
        .select("template_id")
        .eq("user_id", user.id);
      if (!active) return;
      setFavorites(
        new Set(((data ?? []) as Array<{ template_id: string }>).map((row) => row.template_id))
      );
      setFavoritesLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesQuery =
        !query ||
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        (t.description ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesFilter =
        filter === "All" ||
        (filter === FAVORITES_FILTER
          ? favorites.has(t.id)
          : t.categories.some((c) => c === filter || c.toLowerCase() === filter.toLowerCase()));
      return matchesQuery && matchesFilter;
    });
  }, [templates, query, filter, favorites]);

  const viewingFavorites = filter === FAVORITES_FILTER;
  // Nothing to show because the account has no favourites at all (as opposed to
  // a search that excludes them) — worth its own prompt.
  const favoritesPrompt = viewingFavorites && favoritesLoaded && favorites.size === 0;

  const {
    visibleItems: visibleTemplates,
    hasMore,
    loading,
    loadMore,
  } = useInfiniteReveal(
    filtered,
    `${query}|${filter}|${viewingFavorites ? favorites.size : 0}`
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-14 lg:px-8">
      {/* Page header */}
      <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-xl">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">Template Library</p>
          <h1 className="mt-3 hidden font-heading-2xl text-ivory-950 sm:font-heading-3xl lg:block">Find your website style</h1>
          <p className="mt-4 hidden font-body-md leading-relaxed text-navy-800 sm:font-body-lg lg:block">
            Open any template as a live demo on your phone, personalize it in minutes,
            and publish with a reserved link of your choice.
          </p>
        </div>

        <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-navy-300 bg-ivory-50 px-4 py-2.5 shadow-sm">
          <Icon name="search" size="sm" className="text-navy-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="w-full bg-transparent font-body text-navy-950 placeholder:text-navy-400 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-navy-500 hover:text-navy-950">
              <Icon name="close" size="sm" />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="scrollbar-none mt-8 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilter(FAVORITES_FILTER)}
          aria-pressed={viewingFavorites}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 font-body-xs font-semibold transition-colors ${
            viewingFavorites
              ? "bg-ivory-950 text-ivory-50"
              : "border border-navy-300 bg-ivory-50 text-navy-950 hover:bg-ivory-200"
          }`}
        >
          <Icon
            name={userId ? "favorite" : "favorite_border"}
            size="sm"
            weight={viewingFavorites ? "w600" : "w400"}
            className="!text-[16px]"
          />
          {FAVORITES_FILTER}
        </button>

        <span className="my-1.5 w-px shrink-0 bg-navy-300" aria-hidden />

        {categoryFilters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-4 py-2 font-body-xs font-semibold transition-colors ${
              filter === f
                ? "bg-ivory-950 text-ivory-50"
                : "border border-navy-300 bg-ivory-50 text-navy-950 hover:bg-ivory-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="font-body-sm text-navy-700">
          Showing <strong className="text-navy-950">{filtered.length}</strong> template{filtered.length === 1 ? "" : "s"}
        </p>
        <Badge tone="gold" icon="diamond">Prices include GST</Badge>
      </div>

      {viewingFavorites && !favoritesLoaded ? (
        <div className="grid grid-cols-2 gap-3 py-6 sm:mt-8 sm:gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl border border-navy-200 bg-ivory-100" />
          ))}
        </div>
      ) : favoritesPrompt ? (
        <div className="mt-10 rounded-2xl border border-dashed border-navy-300 bg-ivory-50 p-16 text-center">
          <Icon name={userId ? "favorite_border" : "lock"} size="xl" className="mx-auto text-navy-400" />
          <p className="mt-4 font-heading-md font-semibold text-ivory-950">
            {userId ? "Nothing saved yet" : "Sign in to see your favourites"}
          </p>
          <p className="mt-1 font-body-sm text-navy-700">
            {userId
              ? "Tap the ♥ on any template to keep it here."
              : "Favourites are stored on your account, so they need a quick sign-in."}
          </p>
          {userId ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("All");
              }}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-ivory-950 px-6 font-body-sm font-semibold text-ivory-50"
            >
              <Icon name="grid_view" size="sm" /> Browse all templates
            </button>
          ) : (
            <Link
              href="/login?next=/templates"
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-ivory-950 px-6 font-body-sm font-semibold text-ivory-50"
            >
              <Icon name="login" size="sm" /> Sign in
            </Link>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-navy-300 bg-ivory-50 p-16 text-center">
          <Icon name="search" size="xl" className="mx-auto text-navy-400" />
          <p className="mt-4 font-heading-md font-semibold text-ivory-950">No templates match</p>
          <p className="mt-1 font-body-sm text-navy-700">Try a different search query or clear the filters.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("All");
            }}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-ivory-950 px-6 font-body-sm font-semibold text-ivory-50"
          >
            <Icon name="refresh" size="sm" /> Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 py-6 sm:mt-8 sm:gap-6 lg:grid-cols-3">
          {visibleTemplates.map((t, i) => (
            <TemplateCard
              key={t.slug}
              t={{
                slug: t.slug,
                name: t.name,
                description: t.description,
                thumbnailUrl: t.thumbnailUrl,
                priceLabel: t.priceLabel,
                priceSuffix: t.priceSuffix,
                categories: t.categories,
              }}
              index={i}
            />
          ))}
        </div>
      )}

      <InfiniteScrollFooter
        hasMore={hasMore}
        loading={loading}
        onLoadMore={loadMore}
        className="pb-10"
      />
    </div>
  );
}