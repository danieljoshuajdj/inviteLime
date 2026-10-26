import { Icon, type IconName } from "@/components/shared/Icon";

const features: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "auto_awesome",
    title: "Personal animated suites",
    body: "Every template includes a tasteful 'Open Invitation' experience with background soundtrack, animated reveals, and cinematic transitions.",
  },
  {
    icon: "schedule",
    title: "Multi-event schedules",
    body: "Sangeet, mehendi, pheras, reception or church — a master timeline plus individual cards with venues, addresses, directions and maps.",
  },
  {
    icon: "celebration",
    title: "RSVPs that feel personal",
    body: "Guests RSVP without logging in, add guest counts and dietary notes. You check live attendance per event and message everyone at once.",
  },
  {
    icon: "flight",
    title: "Travel & stay guides",
    body: "Detailed venue and hotel information, airport/hotel/venue distances and transit details make it effortless for out-of-town family.",
  },
  {
    icon: "public",
    title: "One reserved link forever",
    body: "A personal link with your names in it that never changes — even when you edit content before or after the wedding.",
  },
  {
    icon: "qr_code_2",
    title: "Scan & instant open",
    body: "Guests scan a QR code from the card or WhatsApp link and your website opens natively, with no app to install.",
  },
];

export function Features() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-14 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">
              Everything included
            </p>
            <h2 className="mt-3 font-heading-2xl text-ivory-950">
              Your invitation, elevated to a personal website
            </h2>
          </div>
          <p className="max-w-sm font-body-sm leading-relaxed text-navy-800">
            Familiar, useful and elegant touches designed for the modern wedding —
            from the first 'open' to the very last RSVP.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-navy-200 bg-ivory-50 p-6 transition-all hover:-translate-y-1 hover:border-sapphire-300 hover:shadow-md"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ivory-950 text-ivory-50 transition-colors group-hover:bg-sapphire-700">
                <Icon name={f.icon} size="lg" weight="w400" />
              </span>
              <h3 className="mt-4 font-heading-md font-semibold text-ivory-950">{f.title}</h3>
              <p className="mt-2 font-body-sm leading-relaxed text-navy-800">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}