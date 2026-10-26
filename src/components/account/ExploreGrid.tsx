"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";

import { Icon } from "@/components/shared/Icon";
import { InfiniteScrollFooter } from "@/components/shared/InfiniteScrollFooter";
import { categorySlug, matchesSelectedCategories } from "@/components/account/explore-filter";
import type { RuntimePlannerBrand } from "@/lib/runtime/payload";
import { createBrowserClient } from "@/lib/supabase/client";
import { useInfiniteReveal } from "@/lib/use-infinite-reveal";
import { cn } from "@/lib/utils";

export interface ExploreItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  priceLabel: string;
  categories: string[];
}

export function ExploreGrid({ 
  templates, 
  initialFavorites, 
  userId,
  isPlanner = false,
  plannerBrand = null
}: { 
  templates: ExploreItem[]; 
  initialFavorites: string[]; 
  userId: string;
  isPlanner?: boolean;
  plannerBrand?: RuntimePlannerBrand | null;
}) {
  const [favorites, setFavorites] = useState<string[]>(initialFavorites);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "favorites">("all");
  const [demoTemplate, setDemoTemplate] = useState<ExploreItem | null>(null);
  const [demoReady, setDemoReady] = useState(false);
  const [withBranding, setWithBranding] = useState(Boolean(plannerBrand));
  const canPreviewBranding = Boolean(plannerBrand);
  const demoFrameRef = useRef<HTMLIFrameElement>(null);

  const toggleFavorite = useCallback(async (templateId: string) => {
    if (!userId) return;
    const supabase = createBrowserClient();
    const isFav = favorites.includes(templateId);
    setFavorites((prev) => (isFav ? prev.filter((id) => id !== templateId) : [...prev, templateId]));
    try {
      if (isFav) {
        await supabase.from("favorite_templates").delete().eq("user_id", userId).eq("template_id", templateId);
      } else {
        await supabase.from("favorite_templates").insert({ user_id: userId, template_id: templateId });
      }
    } catch {
      // Revert on error
      setFavorites((prev) => (isFav ? [...prev, templateId] : prev.filter((id) => id !== templateId)));
    }
  }, [favorites, userId]);

  // The demo runs in a full-screen preview. Lock the dashboard behind it and
  // let Escape close the preview, matching the shared Modal behaviour.
  useEffect(() => {
    if (!demoTemplate) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDemoTemplate(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    // The preview embeds the public demo page, which in turn boots the sandboxed
    // template. Its load event can wait on remote artwork, so watch the
    // same-origin demo document directly: once its own "Opening invitation…"
    // overlay is gone, reveal the frame. Require the document URL to match the
    // branding state we just requested so the previous (ready) document cannot
    // remove the loader before the new preview has actually navigated. The
    // timeout is a safety net for a template package that never finishes booting.
    const expectBranding = withBranding && canPreviewBranding;
    const demoUrlMatches = () => {
      const win = demoFrameRef.current?.contentWindow;
      if (!win) return false;
      try {
        const url = new URL(win.location.href);
        return (
          url.pathname.endsWith(`/templates/${demoTemplate.slug}/demo`) &&
          url.searchParams.get("embed") === "1" &&
          (url.searchParams.get("branding") === "1") === expectBranding
        );
      } catch {
        return false;
      }
    };
    const revealWhenPainted = window.setInterval(() => {
      const doc = demoFrameRef.current?.contentDocument;
      if (!doc?.body || !demoUrlMatches()) return;

      const stillOpening = doc.body.innerText.includes("Opening invitation");
      const hasContent = Boolean(doc.querySelector("iframe")) || doc.body.innerText.trim().length > 0;
      if (!stillOpening && hasContent) {
        setDemoReady(true);
        window.clearInterval(revealWhenPainted);
      }
    }, 250);
    const fallback = window.setTimeout(() => {
      // Only clear the loader if the expected document is actually on screen.
      if (demoUrlMatches()) setDemoReady(true);
    }, 45000);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearInterval(revealWhenPainted);
      window.clearTimeout(fallback);
    };
  }, [demoTemplate, withBranding, canPreviewBranding]);

  const filteredTemplates = templates.filter((t) => {
    const matchesQuery = 
      !query ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(query.toLowerCase()) ||
      t.categories.some((c) => c.toLowerCase().includes(query.toLowerCase()));
    
    const matchesCategory = matchesSelectedCategories(t.categories, selectedCategories);
    
    const matchesTab = activeTab === "all" || favorites.includes(t.id);
    
    return matchesQuery && matchesCategory && matchesTab;
  });

  // Categories are stored as display names, while the chip state is keyed by
  // slug; the match above converts names to slugs so a selected filter actually
  // narrows the grid instead of emptying it.
  const revealKey = `${query}|${activeTab}|${selectedCategories.join(",")}|${
    activeTab === "favorites" ? favorites.length : 0
  }`;
  const {
    visibleItems: visibleTemplates,
    hasMore,
    loading,
    loadMore,
  } = useInfiniteReveal(filteredTemplates, revealKey);

  const handleCategoryToggle = (categorySlug: string) => {
    setSelectedCategories((prev) => 
      prev.includes(categorySlug) 
        ? prev.filter((c) => c !== categorySlug) 
        : [...prev, categorySlug]
    );
  };

  // Extract unique categories from templates
  const uniqueCategories = Array.from(
    new Set(templates.flatMap((t) => t.categories))
  ).map((name) => ({ name, slug: categorySlug(name) }));

  if (filteredTemplates.length === 0 && activeTab === "all") {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant p-12 text-center">
        <Icon name="search" size="xl" className="mx-auto text-outline" />
        <p className="mt-4 font-heading-md font-semibold !text-on-surface">No templates match</p>
        <p className="mt-1 font-body-sm text-on-surface-variant">Try a different search query or clear the filters.</p>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setSelectedCategories([]);
          }}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-body-sm font-semibold text-on-primary"
        >
          <Icon name="refresh" size="sm" /> Reset filters
        </button>
      </div>
    );
  }

  if (filteredTemplates.length === 0 && activeTab === "favorites") {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant p-12 text-center">
        <Icon name="favorite_border" size="xl" className="mx-auto text-outline" />
        <h2 className="mt-4 font-heading-md font-semibold !text-on-surface">No favorites yet</h2>
        <p className="mt-1 font-body-sm text-on-surface-variant">Tap the ♥ on any template to save it here.</p>
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-body-sm font-semibold text-on-primary"
        >
          <Icon name="storefront" size="sm" /> Browse all templates
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search Field */}
      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary text-[22px]">search</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates by aesthetic, culture, or mood..."
          className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-lowest focus:ring-1 focus:ring-secondary transition-all"
          type="text"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-2 text-on-surface-variant font-body-sm">
          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">⌘</span>
          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">K</span>
        </div>
      </div>

      {/* Controls Row: Multi-select Chips & View Tabs */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 pt-4">
        {/* Multi-Select Category Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body-sm font-semibold uppercase tracking-wider text-on-surface-variant mr-1">Filter Motif:</span>
          {uniqueCategories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => handleCategoryToggle(cat.slug)}
              className={`filter-chip group flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body-md transition-all ${
                selectedCategories.includes(cat.slug)
                  ? "bg-secondary-fixed text-on-secondary-fixed"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <Icon 
                name={selectedCategories.includes(cat.slug) ? "check_box" : "check_box_outline_blank"} 
                size="sm" 
                className={selectedCategories.includes(cat.slug) ? "text-secondary font-bold" : "text-outline"}
              />
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Segmented Tab Switcher */}
        <div className="flex items-center p-1 bg-surface-container rounded-lg self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-lg font-body-md transition-all flex items-center gap-1.5 ${
              activeTab === "all"
                ? "bg-surface-lowest text-on-surface shadow-xs"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>All Templates</span>
            <span className="px-1.5 py-0.5 rounded-full bg-surface-container font-body-xs text-on-surface">{templates.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("favorites")}
            className={`px-4 py-2 rounded-lg font-body-md transition-all flex items-center gap-1.5 ${
              activeTab === "favorites"
                ? "bg-surface-lowest text-on-surface shadow-xs"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon name="favorite" size="sm" className="text-secondary" />
            <span>My Favorites</span>
            <span className="px-1.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-body-xs">{favorites.length}</span>
          </button>
        </div>
      </div>

      {/* Template Cards */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTemplates.map((t) => {
          const isFav = favorites.includes(t.id);
          return (
            <article key={t.id} className="group relative flex flex-col rounded-xl bg-surface-lowest overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
              {/* Visual Artwork Canvas. The whole image is a link, but the
                  favourite control stays a sibling so we never nest a button
                  inside an anchor (which breaks hydration). */}
              <div className="relative h-96 w-full bg-surface-container-high overflow-hidden">
                <Link
                  href={`/templates/${t.slug}`}
                  aria-label={`View ${t.name}`}
                  className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                />
                {t.thumbnailUrl ? (
                  <img
                    src={t.thumbnailUrl}
                    alt={t.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-sapphire-100 via-rose-50 to-gold-100 flex items-center justify-center">
                    <Icon name="auto_awesome" size="xl" weight="w200" className="text-navy-400/50" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary-container/80 via-transparent to-black/20" />
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4">
                  <div className="flex items-start justify-between gap-3">
                    {t.categories.length > 0 ? (
                      <span className="inline-block max-w-[75%] truncate rounded-full bg-white px-2.5 py-1 font-body-xs font-semibold uppercase tracking-wider text-on-surface shadow-sm ring-1 ring-black/5">
                        {t.categories[0]}
                      </span>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => void toggleFavorite(t.id)}
                      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                      className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md transition-transform hover:scale-110 active:scale-95 ${
                        isFav ? "text-error" : "text-on-surface"
                      }`}
                    >
                      <Icon name={isFav ? "favorite" : "favorite_border"} size="md" filled={isFav} />
                    </button>
                  </div>
                  <div className="text-surface-bright">
                    <p className="font-body-xs font-semibold uppercase tracking-widest text-secondary-fixed">
                      {t.categories.slice(0, 3).join(" • ")}
                    </p>
                    <h3 className="font-heading-sm font-normal text-on-primary mt-0.5">{t.name}</h3>
                  </div>
                </div>
              </div>
              {/* Card Content & Pricing */}
              <div className="p-4 flex flex-col justify-between flex-1 gap-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-body-xs font-semibold uppercase tracking-wider text-on-surface-variant">Investment</span>
                    <p className="font-heading-sm font-semibold !text-on-surface mt-0.5">{t.priceLabel}</p>
                  </div>
                </div>
                <p className="font-body-sm text-on-surface-variant line-clamp-2">
                  {t.description}
                </p>
                {/* Interactive Triggers */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => {
                      setDemoReady(false);
                      setWithBranding(Boolean(plannerBrand));
                      setDemoTemplate(t);
                    }}
                    className="w-full py-2.5 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-md text-center transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Icon name="visibility" size="sm" />
                    Demo
                  </button>
                  <Link
                    href={`/create/new?template=${t.slug}`}
                    className="inline-flex h-9 w-full items-center justify-center rounded-full bg-primary px-3 font-body-sm font-semibold tracking-wide text-white transition-all hover:bg-[#2a2a26] active:scale-[0.98]"
                  >
                    Use
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <InfiniteScrollFooter hasMore={hasMore} loading={loading} onLoadMore={loadMore} />

      {/* Live demo preview. This embeds the real template runtime from
          /templates/[slug]/demo instead of a mocked-up invitation card, so
          everything guests can tap — music, gallery, RSVP — works here too. */}
      {demoTemplate && (
        <div
          className="fixed inset-0 z-[120] flex bg-inverse-surface/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 lg:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${demoTemplate.name} live demo`}
          onClick={() => setDemoTemplate(null)}
        >
          <div
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-surface-lowest shadow-2xl animate-in fade-in zoom-in duration-200 sm:h-[90dvh] sm:max-w-6xl sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant bg-surface-lowest px-3 py-2.5 sm:px-5 sm:py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setDemoTemplate(null)}
                  aria-label="Close demo"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface transition-colors hover:bg-surface-container-high"
                >
                  <Icon name="close" size="sm" />
                </button>
                <div className="min-w-0">
                  <p className="truncate font-heading-sm font-semibold !text-on-surface">
                    {demoTemplate.name}
                  </p>
                  <p className="truncate font-body-xs text-secondary">
                    {demoTemplate.categories.join(" • ") || "Live demo"}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFavorite(demoTemplate.id)}
                  aria-label={favorites.includes(demoTemplate.id) ? "Remove from favorites" : "Add to favorites"}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant transition-colors hover:bg-surface-container-low",
                    favorites.includes(demoTemplate.id) ? "text-error" : "text-on-surface"
                  )}
                >
                  <Icon
                    name={favorites.includes(demoTemplate.id) ? "favorite" : "favorite_border"}
                    size="sm"
                    filled={favorites.includes(demoTemplate.id)}
                  />
                </button>
                <Link
                  href={`/templates/${demoTemplate.slug}/demo${withBranding && plannerBrand ? "?branding=1" : ""}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open demo in a new tab"
                  title="Open demo in a new tab"
                  className="hidden h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface transition-colors hover:bg-surface-container-low sm:flex"
                >
                  <Icon name="open_in_new" size="sm" />
                </Link>
                <Link
                  href={`/create/new?template=${demoTemplate.slug}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-3 font-body-sm font-semibold tracking-wide text-white transition-all hover:bg-[#2a2a26] active:scale-[0.98] sm:px-4"
                >
                  <span className="hidden sm:inline">Choose this template</span>
                  <span className="sm:hidden">Use</span>
                  <Icon name="arrow_forward" size="sm" />
                </Link>
              </div>
            </div>

            {isPlanner && (
              <div className="flex shrink-0 items-center border-b border-outline-variant bg-surface-low">
                {plannerBrand ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={withBranding}
                    aria-busy={!demoReady}
                    aria-label="Preview with studio branding"
                    disabled={!demoReady}
                    title={
                      demoReady
                        ? "Show or hide your studio branding in the demo"
                        : "Loading the template preview"
                    }
                    onClick={() => {
                      setDemoReady(false);
                      setWithBranding((value) => !value);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-secondary disabled:cursor-wait disabled:hover:bg-transparent sm:px-5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-on-surface-variant">
                      <Icon name="palette" size="sm" className="shrink-0 text-secondary" />
                      <span className="truncate font-body-sm">Preview with studio branding</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="w-6 text-right font-body-xs font-semibold text-on-surface">
                        {withBranding ? "On" : "Off"}
                      </span>
                      <span
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors",
                          withBranding ? "bg-secondary" : "bg-outline-variant"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                            withBranding ? "translate-x-5" : "translate-x-0"
                          )}
                          aria-hidden={!demoReady}
                        >
                          {!demoReady && (
                            <span
                              className={cn(
                                "h-3 w-3 animate-spin rounded-full border-2 border-t-transparent",
                                withBranding ? "border-secondary" : "border-on-surface/60"
                              )}
                            />
                          )}
                        </span>
                      </span>
                    </span>
                  </button>
                ) : (
                  <div className="flex w-full items-center justify-between gap-3 px-3 py-2 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2 text-on-surface-variant">
                      <Icon name="palette" size="sm" className="shrink-0 text-secondary" />
                      <span className="truncate font-body-sm">Preview with studio branding</span>
                    </div>
                    <Link
                      href="/app/account/brand"
                      target="_blank"
                      className="shrink-0 font-body-xs font-semibold text-secondary hover:underline"
                    >
                      Add brand details
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#211f1b] p-3 sm:p-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(254,249,242,0.14),transparent_65%)]" />
              {/* Phone-shaped stage keeps the demo in the same mobile viewport
                  the couple's guests will actually use. */}
              <div className="relative flex h-full max-h-[820px] w-full max-w-[340px] flex-col overflow-hidden rounded-[2.6rem] border-[8px] border-[#0d0c0a] bg-[#0d0c0a] shadow-[0_35px_90px_-20px_rgba(0,0,0,0.95)] ring-1 ring-white/15 sm:border-[10px]">
                <div className="flex h-8 shrink-0 items-center justify-center">
                  <span className="h-4 w-24 rounded-full bg-black ring-1 ring-white/10" />
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.8rem] bg-ivory-950">
                  {!demoReady && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-low text-on-surface-variant">
                      <Icon name="refresh" size="lg" className="animate-spin text-secondary" />
                      <p className="font-body-sm">Opening live demo…</p>
                    </div>
                  )}
                  <iframe
                    ref={demoFrameRef}
                    src={`/templates/${demoTemplate.slug}/demo?embed=1${
                      withBranding && plannerBrand ? "&branding=1" : ""
                    }`}
                    title={`${demoTemplate.name} live demo`}
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    className="h-full w-full border-0 bg-ivory-950"
                  />
                </div>
                <div className="flex h-7 shrink-0 items-center justify-center">
                  <span className="h-1 w-24 rounded-full bg-white/30" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}