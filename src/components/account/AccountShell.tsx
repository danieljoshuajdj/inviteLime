"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/shared/Button";
import { Icon, type IconName } from "@/components/shared/Icon";
import { LogoLink } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

interface Props {
  user: { email: string; name: string };
  isAdmin: boolean;
  children: React.ReactNode;
}

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/app/explore", label: "Explore Templates", icon: "storefront" },
  { href: "/app/invitations", label: "My Invitations", icon: "auto_awesome" },
  { href: "/app/favorites", label: "Favorites", icon: "favorite" },
  // Brand details and Planner plan are section tabs inside Settings now, so
  // they no longer crowd the main navigation.
  { href: "/app/account", label: "Settings", icon: "settings" },
];

export function AccountShell({ user, isAdmin, children }: Props) {
  const pathname = usePathname();

  // Only the most specific match is the active section. /app/account is the
  // parent of the brand and plan pages, so those routes keep Settings active.
  const activeHref = nav
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* Sidebar (desktop). Scrolls itself when the viewport is shorter than
          its content, with the indicator hidden. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto no-scrollbar border-r border-outline-variant bg-surface-container-low py-6 md:flex">
        <div className="px-5">
          <LogoLink href="/app/explore" height={30} />
          <p className="mt-1.5 font-body-xs text-on-surface-variant">Atelier console</p>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1 px-3">
          {nav.map((n) => {
            const active = n.href === activeHref;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-body-sm font-semibold transition-colors",
                  active
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                )}
              >
                <Icon name={n.icon} size="sm" />
                {n.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className="mt-2 flex items-center gap-3 rounded-xl border border-secondary/30 bg-secondary/5 px-3.5 py-2.5 font-body-sm font-semibold text-secondary transition-colors hover:bg-secondary/10"
            >
              <Icon name="verified_user" size="sm" />
              Admin Panel
            </Link>
          )}
        </nav>

        <div className="border-t border-outline-variant px-4 pt-4">
          <form action="/logout" method="post">
            <Button variant="ghost" size="sm" fullWidth icon="logout" className="justify-start">
              Sign out ({user.name || user.email})
            </Button>
          </form>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-outline-variant bg-surface px-4 md:hidden">
        {/* Full lockup, not just the monogram: the wordmark is the visible
            brand on phones, where there is no sidebar heading. */}
        <LogoLink href="/app/explore" height={26} priority />
        <MobileNav nav={nav} activeHref={activeHref} />
      </header>

      <main className="flex-1 md:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-8 md:pb-8 2xl:max-w-none">{children}</div>
      </main>
    </div>
  );
}

function MobileNav({
  nav,
  activeHref,
}: {
  nav: { href: string; label: string; icon: IconName }[];
  activeHref: string | undefined;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid border-t border-outline-variant bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
    >
      {nav.map((n) => {
        const active = n.href === activeHref;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex w-full flex-col items-center gap-0.5 px-1 py-2.5 text-center text-[10px] font-semibold leading-tight transition-colors",
              active ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            {/* A short underline makes the current section obvious even when
                the icon itself has no filled variant. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-4 top-0 h-0.5 rounded-b-full transition-colors",
                active ? "bg-primary" : "bg-transparent"
              )}
            />
            <Icon name={n.icon} size="sm" filled={active} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}