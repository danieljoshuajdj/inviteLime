"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How many new cards each scroll tick reveals. Six fills two desktop rows. */
export const TEMPLATE_PAGE_SIZE = 6;

/** How long the "loading more" state is shown before the next page appears. */
const REVEAL_DELAY_MS = 300;

interface RevealState {
  /** The filter/search key this state belongs to. */
  key: string;
  count: number;
  loading: boolean;
}

/**
 * Client-side infinite reveal for lists that are already fully loaded.
 *
 * Template browsing pages fetch their (small) catalogue on the server, so the
 * pagination is presentational: render one page at a time, then append the next
 * when the sentinel scrolls into view. A changed `resetKey` (search, category,
 * tab) is treated as page one without a reset effect, so the new result never
 * flashes the previous page's count.
 */
export function useInfiniteReveal<T>(
  items: T[],
  resetKey: string,
  pageSize: number = TEMPLATE_PAGE_SIZE
) {
  const [state, setState] = useState<RevealState>({
    key: resetKey,
    count: pageSize,
    loading: false,
  });
  const timer = useRef<number | null>(null);

  // Values for a stale filter are ignored immediately; the pending timer is
  // cleared when the key changes (or the component unmounts).
  const visibleCount = state.key === resetKey ? state.count : pageSize;
  const loading = state.key === resetKey ? state.loading : false;
  const hasMore = visibleCount < items.length;

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    },
    [resetKey]
  );

  const loadMore = useCallback(() => {
    if (timer.current !== null || !hasMore) return;

    const key = resetKey;
    const total = items.length;
    timer.current = window.setTimeout(() => {
      setState((prev) =>
        prev.key === key
          ? { ...prev, count: Math.min(prev.count + pageSize, total), loading: false }
          : prev
      );
      timer.current = null;
    }, REVEAL_DELAY_MS);

    setState((prev) =>
      prev.key === key
        ? { ...prev, loading: true }
        : { key, count: pageSize, loading: true }
    );
  }, [hasMore, items.length, pageSize, resetKey]);

  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore,
    loading,
    loadMore,
  };
}
