import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/shared/Button";
import { Icon, type IconName } from "@/components/shared/Icon";

export const metadata: Metadata = {
  title: "About",
  description: "The story and philosophy behind Invite Lime, a couture wedding invitation platform.",
};

const values: { icon: IconName; title: string; body: string }[] = [
  { icon: "diamond", title: "Couture first", body: "Every template is crafted by designers as a signature piece, not a template farm." },
  { icon: "handshake", title: "Trust & privacy", body: "Guest data belongs to couples. We never sell it, and invitations skip public search engines." },
  { icon: "auto_awesome", title: "Craft that moves", body: "Motion, music and storytelling make opening an invitation feel like an event in itself." },
];

export default function AboutPage() {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">Our story</p>
          <h1 className="mt-3 font-heading-3xl text-ivory-950">
            Made for the memory-makers of your wedding week
          </h1>
          <p className="mt-5 font-body-lg leading-relaxed text-navy-800">
            Invite Lime began with a simple frustration: wedding invites were either generic,
            clunky pages or beautiful cards that did nothing. We believed your invitation
            could feel as personal, elegant and alive as the wedding itself — designed to
            be opened on a phone, shared on WhatsApp, and remembered long after the cake.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-navy-200 bg-ivory-50 p-7 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ivory-950 text-ivory-50">
                <Icon name={v.icon} size="xl" weight="w400" />
              </span>
              <h2 className="mt-4 font-heading-md font-semibold text-ivory-950">{v.title}</h2>
              <p className="mt-2 font-body-sm leading-relaxed text-navy-800">{v.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-3xl bg-ivory-950 p-10 text-center text-ivory-50 sm:p-14">
          <h2 className="mx-auto max-w-xl font-heading-2xl">Ready to craft your signature invitation?</h2>
          <p className="mx-auto mt-3 max-w-lg font-body-lg text-ivory-300">
            Join thousands of couples who turned their wedding invite into a keepsake website.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/create/browse">
              <Button size="lg">Start creating free</Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="border-ivory-700 text-ivory-50 hover:bg-ivory-900">
                Talk to us
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}