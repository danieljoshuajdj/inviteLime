import type { Metadata } from "next";

import { Workflow } from "@/components/public/Workflow";
import { Features } from "@/components/public/Features";
import { Icon, type IconName } from "@/components/shared/Icon";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Choose a template, personalize your event details, publish a reserved link, and invite everyone you love.",
};

const details: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "link",
    title: "Reserved link, forever yours",
    body: "Your invitation link is reserved with your names inside it, e.g. /zayed-weds-maya. It stays the same even after edits, so printed cards and WhatsApp forwards never break.",
  },
  {
    icon: "person",
    title: "Guest names in every invite",
    body: "Type your guest list and Invite Lime sends each guest a WhatsApp message that says their name — every invite feels personal, no broadcast blast.",
  },
  {
    icon: "qr_code_2",
    title: "QR cards & instant opening",
    body: "Open the invitation on any smartphone instantly. No app to download, no login for guests. A tasteful cover opens into a full cinematic experience.",
  },
  {
    icon: "bolt",
    title: "Fast, secure & always on",
    body: "Built on a modern stack with automatic backups. Invitations stay fast even on flaky 2G while travelling, and party data is kept private.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="pt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">Made simple</p>
            <h1 className="mt-3 font-heading-3xl text-ivory-950">Create your wedding website in minutes</h1>
            <p className="mt-5 font-body-lg leading-relaxed text-navy-800">
              No design skills needed. Follow these steps and wow your guests with a
              personal, animated invitation they will love to open.
            </p>
          </div>
        </div>
      </section>

      <Workflow />

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {details.map((d) => (
              <div key={d.title} className="rounded-2xl border border-navy-200 bg-ivory-50 p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ivory-950 text-ivory-50">
                  <Icon name={d.icon} size="lg" />
                </span>
                <h3 className="mt-4 font-heading-md font-semibold text-ivory-950">{d.title}</h3>
                <p className="mt-2 font-body-sm leading-relaxed text-navy-800">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Features />
    </>
  );
}