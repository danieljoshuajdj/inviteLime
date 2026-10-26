import Link from "next/link";

import { Icon } from "@/components/shared/Icon";

export function PricingTeaser() {
  return (
    <section className="bg-ivory-950 py-20 text-ivory-50">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-4 text-center sm:px-6 lg:px-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400 text-ivory-950">
          <Icon name="diamond" size="xl" weight="w500" />
        </div>
        <h2 className="max-w-2xl font-heading-2xl">
          One-time license fee, a lifetime of memorable evenings
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/templates"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-gold-400 px-8 font-body-md font-semibold text-ivory-950 transition-transform hover:scale-[1.02]"
          >
            Explore template pricing <Icon name="arrow_forward" size="sm" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-ivory-700 px-8 font-body-md font-semibold text-ivory-50 hover:bg-ivory-900"
          >
            Compare editions
          </Link>
        </div>
        <p className="max-w-xl font-body-sm leading-relaxed text-ivory-300">
          Every template includes unlimited events &amp; guest RSVPs, hosting for
          13-months, a custom link, and lifetime access with editing privileges —
          start with a free preview, pay once on publishing.
        </p>
      </div>
    </section>
  );
}