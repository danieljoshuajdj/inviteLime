import Link from "next/link";

import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/shared/Badge";

export interface TemplateCardData {
  slug: string;
  name: string;
  description: string | null;
  priceLabel?: string;
  /** Optional note shown only from the `sm` breakpoint up (e.g. " onwards"). */
  priceSuffix?: string;
  thumbnailUrl?: string | null;
  categories?: string[];
  isNew?: boolean;
}

export function TemplateCard({ t, index = 0 }: { t: TemplateCardData; index?: number }) {
  return (
    <Link
      href={`/templates/${t.slug}`}
      className="group overflow-hidden rounded-2xl border border-navy-200 bg-ivory-50 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-sapphire-50">
        {t.thumbnailUrl ? (
          <img
            src={t.thumbnailUrl}
            alt={t.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sapphire-100 via-rose-50 to-gold-100">
            <Icon name="image" size="2xl" className="text-navy-400/60" weight="w200" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-ivory-950/0 opacity-0 transition-all group-hover:bg-ivory-950/30 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-50 text-ivory-950">
            <Icon name="play_circle" size="lg" weight="w600" />
          </span>
        </div>
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          {t.categories?.slice(0, 2).map((c) => (
            <Badge key={c} tone="primary" className="!bg-ivory-50">{c}</Badge>
          ))}
          {t.isNew && <Badge tone="gold" className="!bg-gold-400/90 !text-ivory-950">New</Badge>}
        </div>
      </div>

      <div className="p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <h3 className="font-heading-sm font-semibold text-ivory-950">{t.name}</h3>
          {t.priceLabel && (
            <span className="shrink-0 font-body-md font-bold text-sapphire-700">
              {t.priceLabel}
              {t.priceSuffix ? <span className="hidden sm:inline">{t.priceSuffix}</span> : null}
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 font-body-sm leading-relaxed text-navy-700">
          {t.description}
        </p>
        <span className="mt-3 inline-flex items-center gap-1 font-body-xs font-semibold text-sapphire-700">
          View showcase{" "}
          <Icon name="north_east" size="sm" className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  );
}