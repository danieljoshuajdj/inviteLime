import Link from "next/link";

import { Icon } from "@/components/shared/Icon";
import { LogoLink } from "@/components/shared/Logo";

const columns = [
  {
    title: "Explore",
    links: [
      { href: "/templates", label: "Template Library" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
      { href: "/live-demos", label: "Live Demos" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Invite Lime" },
      { href: "/contact", label: "Contact & support" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="bg-ivory-950 text-ivory-50">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
          <div>
            <LogoLink href="/" height={34} onDark />
            <p className="mt-4 max-w-xs font-body-sm leading-relaxed text-ivory-300">
              Haute wedding invitation platform. Couture templates, a personal
              touch, and a live interactive website for every guest in your
              world.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="font-body-sm font-semibold uppercase tracking-widest text-ivory-400">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="font-body-sm text-ivory-200 hover:text-ivory-50 hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="font-body-sm font-semibold uppercase tracking-widest text-ivory-400">
              Start creating
            </h3>
            <p className="mt-4 font-body-sm leading-relaxed text-ivory-300">
              Choose a couture template, personalize it in minutes (even on your
              phone), and share a dazzling link with every invitee.
            </p>
            <Link
              href="/create/browse"
              className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ivory-50 px-6 font-body-md font-semibold text-ivory-950 transition-transform hover:scale-[1.02]"
            >
              Create yours
              <Icon name="arrow_forward" size="sm" />
            </Link>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ivory-900 pt-6 sm:flex-row">
          <p className="font-body-xs text-ivory-400">
            © {new Date().getFullYear()} Invite Lime. All rights reserved.
          </p>
          <div className="flex items-center gap-4 font-body-xs text-ivory-400">
            <Link href="/privacy" className="hover:text-ivory-50">Privacy</Link>
            <Link href="/terms" className="hover:text-ivory-50">Terms</Link>
            <Link href="/contact" className="hover:text-ivory-50">
              <span className="flex items-center gap-1">
                <Icon name="mail" size="sm" className="!text-[14px]" /> Support
              </span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}