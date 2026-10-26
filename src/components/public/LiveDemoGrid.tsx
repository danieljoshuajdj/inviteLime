"use client";

import Link from "next/link";

import { Badge } from "@/components/shared/Badge";
import { Icon } from "@/components/shared/Icon";
import { InfiniteScrollFooter } from "@/components/shared/InfiniteScrollFooter";
import { useInfiniteReveal } from "@/lib/use-infinite-reveal";

export interface LiveDemoItem {
  id: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  /** Formatted price label from the server-resolved currency quote. */
  priceLabel: string;
  payable: boolean;
}

/** Live-demo cards with the same scroll pagination as the template library. */
export function LiveDemoGrid({ demos }: { demos: LiveDemoItem[] }) {
  const { visibleItems, hasMore, loading, loadMore } = useInfiniteReveal(demos, "live-demos");

  return (
    <>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((t) => (
          <Link
            key={t.id}
            href={`/templates/${t.slug}/demo`}
            className="group overflow-hidden rounded-2xl border border-navy-200 bg-ivory-50 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-sapphire-100 via-rose-50 to-gold-100">
              {t.thumbnailUrl ? (
                <img
                  src={t.thumbnailUrl}
                  alt={t.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ivory-950/80 text-ivory-50 shadow-xl transition-transform group-hover:scale-110">
                  <Icon name="play_circle" size="xl" weight="w500" />
                </span>
              )}
              <div className="absolute left-3 top-3">
                <Badge tone="primary" className="!bg-ivory-50">Demo Mode</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <h2 className="font-heading-sm font-semibold text-ivory-950">{t.name}</h2>
                {t.payable ? (
                  <p className="font-body-xs text-navy-700">Licensed from {t.priceLabel}</p>
                ) : (
                  <p className="font-body-xs text-navy-700">Sample content, no purchase needed</p>
                )}
              </div>
              <Icon name="north_east" size="sm" className="text-sapphire-700" />
            </div>
          </Link>
        ))}
      </div>

      <InfiniteScrollFooter hasMore={hasMore} loading={loading} onLoadMore={loadMore} />
    </>
  );
}
