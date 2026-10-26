"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { LogoLink } from "@/components/shared/Logo";

const links = [
  { href: "/templates", label: "Templates" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

export function PublicNav({
  signedIn = false,
  dashboardHref = "/app/invitations",
}: {
  signedIn?: boolean;
  dashboardHref?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-navy-200/70 bg-ivory-50/85 backdrop-blur-md">
      {/* Promo strip */}
      {/* <div className="bg-ivory-900 py-1.5 text-center font-body-xs font-medium tracking-wide text-ivory-50">
        Couture wedding websites — <Link href="/templates" className="font-bold underline underline-offset-2">Explore 20+ signature showcases</Link>
      </div> */}

      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <LogoLink href="/" height={38} priority />

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                "rounded-full px-4 py-2 font-body-sm font-medium text-navy-950 transition-colors hover:bg-ivory-200 " +
                (pathname === l.href ? "bg-ivory-200 font-semibold" : "")
              }
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link
              href={dashboardHref}
              className="rounded-full border border-navy-300 px-4 py-2 font-body-sm font-semibold text-navy-950 transition-colors hover:bg-ivory-200"
            >
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="px-3 py-2 font-body-sm font-semibold text-navy-950 hover:underline">
              Sign in
            </Link>
          )}
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-navy-950 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <Icon name={open ? "close" : "menu"} size="md" weight="w500" />
        </button>
      </nav>

      {open && (
        <div className="border-t border-navy-200 bg-ivory-50 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 font-body font-medium text-navy-950 hover:bg-ivory-200"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-navy-200 pt-3">
              {signedIn ? (
                <Link
                  href={dashboardHref}
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-full items-center justify-center rounded-full border border-outline font-body-sm font-semibold text-on-surface"
                >
                  Dashboard
                </Link>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)}>
                  <Button variant="outline" fullWidth size="md">
                    Sign in
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}