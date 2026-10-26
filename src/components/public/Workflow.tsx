import Link from "next/link";

import { Icon, type IconName } from "@/components/shared/Icon";

const steps: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "diamond",
    title: "Choose a Signature Template",
    body: "Explore couture animated suites — from royal heritage to modern editorial — each with a live demo you can open right now on your phone.",
  },
  {
    icon: "palette",
    title: "Personalize Every Detail",
    body: "Add your names, couple story, event schedule, venues, directions, photo gallery, music, hashtags and registry — no coding skills needed.",
  },
  {
    icon: "rocket_launch",
    title: "Publish & Get Your Unique Link",
    body: "Get a reserved link that keeps your names in it forever. Edit anytime without changing your URL, and never worry about fake or leaked links.",
  },
  {
    icon: "send",
    title: "Invite Everyone You Love",
    body: "Send WhatsApp invitations with each guest's name, share RSVP tracking, and broadcast updates about venues, timing or missed calls instantly.",
  },
];

export function Workflow() {
  return (
    <section className="bg-ivory-100/70 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">
            How it works
          </p>
          <h2 className="mt-3 font-heading-2xl text-ivory-950">
            From first idea to RSVPs rolling in
          </h2>
          <p className="mt-4 font-body-lg text-navy-800">
            A personal website experience, ready in minutes — beautifully.
          </p>
        </div>

        <div className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-0 right-0 top-[52px] hidden border-t-2 border-dashed border-sapphire-300/60 lg:block" />
          {steps.map((s, i) => (
            <div key={s.title} className="relative">
              <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-2xl border border-navy-200 bg-ivory-50 shadow-sm">
                <Icon name={s.icon} size="xl" weight="w400" className="text-ivory-950" />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ivory-950 font-body-xs font-bold text-ivory-50">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-5 font-heading-md font-semibold text-ivory-950">{s.title}</h3>
              <p className="mt-2 font-body-sm leading-relaxed text-navy-800">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/create/browse"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-ivory-950 px-8 font-body-md font-semibold text-ivory-50 transition-transform hover:scale-[1.02]"
          >
            Start my website now <Icon name="arrow_forward" size="sm" />
          </Link>
        </div>
      </div>
    </section>
  );
}