import type { Metadata } from "next";

import { ContactForm } from "@/components/public/ContactForm";
import { Icon } from "@/components/shared/Icon";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Talk to the Invite Lime team about your wedding invitation, or get support with an existing one.",
};

const channels = [
  { label: "Email us", value: process.env.EMAIL_FROM ?? "support@invite-lime.example", icon: "mail" as const },
  { label: "WhatsApp concierge", value: "Available in the app after checkout", icon: "phone" as const },
  { label: "Response time", value: "Within 2 business days", icon: "schedule" as const },
];

export default function ContactPage() {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">Contact</p>
            <h1 className="mt-3 font-heading-3xl text-ivory-950">We would love to hear from you</h1>
            <p className="mt-4 font-body-lg leading-relaxed text-navy-800">
              Questions about a template, an order, or a wedding underway? Our concierge
              team is here for you — before, during, and after your big day.
            </p>

            <div className="mt-8 flex flex-col gap-4">
              {channels.map((c) => (
                <div key={c.label} className="flex items-center gap-4 rounded-2xl border border-navy-200 bg-ivory-50 p-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ivory-950 text-ivory-50">
                    <Icon name={c.icon} size="lg" />
                  </span>
                  <div>
                    <p className="font-body-xs uppercase tracking-widest text-navy-600">{c.label}</p>
                    <p className="font-body font-medium text-navy-950">{c.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-navy-200 bg-ivory-50 p-6 shadow-sm sm:p-8">
            <h2 className="font-heading-lg font-semibold text-ivory-950">Send us a message</h2>
            <p className="mt-1 mb-6 font-body-sm text-navy-700">
              We typically reply within 2 business days.
            </p>
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}