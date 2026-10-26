"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/shared/Icon";
import { LogoLink } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/templates", label: "Templates", icon: "inventory_2" },
  { href: "/admin/plans", label: "Planner plans", icon: "workspace_premium" },
  { href: "/admin/invitations", label: "Invitations", icon: "receipt_long" },
  { href: "/admin/music", label: "Music", icon: "music_note" },
  { href: "/admin/media", label: "Media", icon: "image" },
  { href: "/admin/details", label: "Details", icon: "text_fields" },
  { href: "/admin/categories", label: "Categories", icon: "category" },
  { href: "/admin/tags", label: "Tags", icon: "tune" },
  { href: "/admin/users", label: "Users", icon: "group" },
];

export function AdminShell({ children, preview = false }: { children: React.ReactNode; preview?: boolean }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* Sidebar. Scrolls itself when the viewport is shorter than its content
          (indicator hidden) so every item stays reachable; the middle nav still
          flexes to keep the footer at the bottom on tall viewports. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col overflow-y-auto no-scrollbar border-r border-outline-variant bg-surface-container-low md:flex">
        <div className="px-6 py-6">
          <LogoLink href="/admin/dashboard" height={30} />
          <p className="mt-1.5 font-body-xs font-semibold uppercase tracking-widest text-secondary">Admin Studio</p>
        </div>

        {preview && (
          <div className="mx-4 mb-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2">
            <p className="flex items-center gap-2 font-body-xs font-semibold text-warning">
              <Icon name="visibility" size="sm" /> Preview mode
            </p>
            <p className="mt-0.5 font-body-xs text-on-surface-variant">Auth bypassed — read-only UI preview.</p>
          </div>
        )}

        <nav className="flex flex-1 flex-col gap-1 px-4">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 font-body-sm font-semibold transition-colors",
                  active ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-highest"
                )}
              >
                <Icon name={n.icon} size="sm" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-outline-variant px-4 py-4">
          <Link href="/app/explore" className="flex items-center gap-3 rounded-xl px-4 py-2.5 font-body-sm font-medium text-on-surface-variant hover:bg-surface-container-highest">
            <Icon name="storefront" size="sm" /> Customer console
          </Link>
          <Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-2.5 font-body-sm font-medium text-on-surface-variant hover:bg-surface-container-highest">
            <Icon name="home" size="sm" /> Public site
          </Link>
          <form action="/logout" method="post">
            <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 font-body-sm font-medium text-on-surface-variant hover:bg-error/10 hover:text-error">
              <Icon name="logout" size="sm" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-outline-variant bg-surface px-4 md:hidden">
        <LogoLink href="/admin/dashboard" height={26} priority />
        {preview && (
          <span className="rounded-md bg-warning/15 px-2 py-0.5 font-body-xs font-semibold text-warning">Preview</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Link href="/app/explore" className="rounded-lg p-2 text-on-surface-variant" aria-label="Customer console">
            <Icon name="storefront" size="md" />
          </Link>
          <Link href="/" className="rounded-lg p-2 text-on-surface-variant" aria-label="Public site">
            <Icon name="home" size="md" />
          </Link>
        </div>
      </header>

      {/* Mobile tab bar. Columns track the tab count above; the list is the
          source of truth, so the grid must be widened whenever a tab is added. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid border-t border-outline-variant bg-surface pt-1 md:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
      >
        {nav.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex w-full flex-col items-center gap-0.5 px-1 py-2 text-center text-[10px] font-semibold leading-tight transition-colors",
                active ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-3 top-0 h-0.5 rounded-b-full transition-colors",
                  active ? "bg-primary" : "bg-transparent"
                )}
              />
              <Icon name={n.icon} size="sm" filled={active} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 md:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-8 md:pb-12 2xl:max-w-none">{children}</div>
      </main>
    </div>
  );
}