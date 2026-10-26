import Link from "next/link";

import { cn } from "@/lib/utils";

const tabs = [
  { key: "profile", href: "/app/account", label: "Profile" },
  { key: "brand", href: "/app/account/brand", label: "Brand details" },
  { key: "plan", href: "/app/account/plan", label: "Planner plan" },
];

export function AccountTabs({
  active,
  isPlanner,
}: {
  active: "profile" | "brand" | "plan";
  isPlanner: boolean;
}) {
  const visible = isPlanner ? tabs : tabs.slice(0, 1);
  const shareRow = visible.length > 1;
  return (
    <nav className="flex border-b border-outline-variant" aria-label="Account sections">
      {visible.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 py-2.5 text-center font-body-sm font-semibold transition-colors sm:text-start",
            // Equal-width tabs keep Profile, Brand details and Planner plan on
            // a single line on phones instead of wrapping to a second row;
            // desktop keeps the compact, content-width tabs.
            shareRow ? "flex-1 px-2 sm:flex-none sm:px-4" : "px-4",
            tab.key === active
              ? "border-secondary text-secondary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
