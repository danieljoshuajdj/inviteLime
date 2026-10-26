"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";

interface Props {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Button text while idle; also the basis for the loading message. */
  label?: string;
  loadingLabel?: string;
  className?: string;
}

/**
 * Bottom-of-list sentinel. Watches itself with IntersectionObserver and asks
 * for the next page shortly before it scrolls into view. The manual button is
 * a keyboard-friendly fallback when the observer never fires (or is missing).
 */
export function InfiniteScrollFooter({
  hasMore,
  loading,
  onLoadMore,
  label = "Load more templates",
  loadingLabel = "Loading more templates…",
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!hasMore || loading || !el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      // Prefetch a little before the user reaches the very bottom.
      { rootMargin: "320px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div
      ref={ref}
      aria-live="polite"
      aria-busy={loading || undefined}
      className={cn("flex min-h-16 items-center justify-center py-6", className)}
    >
      {loading ? (
        <p className="flex items-center gap-2 font-body-sm font-medium text-on-surface-variant">
          <Icon name="refresh" size="md" className="animate-spin text-secondary" />
          {loadingLabel}
        </p>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-5 font-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          {label}
          <Icon name="expand_more" size="sm" />
        </button>
      )}
    </div>
  );
}
