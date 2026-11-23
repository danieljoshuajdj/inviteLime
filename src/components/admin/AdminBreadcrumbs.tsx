import Link from "next/link";

import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";

export interface AdminBreadcrumbItem {
  label: string;
  /** Parent items are links; the last item is the current page. */
  href?: string;
}

/**
 * Breadcrumbs for admin sections. Wraps on narrow screens instead of
 * overflowing, and every parent item is a real link so browser history
 * (back/forward) works through normal App Router navigation.
 */
export function AdminBreadcrumbs({
  items,
  className,
}: {
  items: AdminBreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-5", className)}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 font-body-xs">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="flex min-w-0 items-center gap-1"
            >
              {index > 0 && (
                <span aria-hidden className="shrink-0 text-on-surface-variant/60">
                  <Icon name="chevron_right" size="xs" />
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="min-w-0 break-words font-semibold text-on-surface"
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="rounded-md px-1 py-0.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-on-surface-variant">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
