import Link from "next/link";

import { Icon } from "@/components/shared/Icon";
import { TemplateCard, type TemplateCardData } from "@/components/public/TemplateCard";

export function TemplateShowcase({ templates }: { templates: TemplateCardData[] }) {
  return (
    <section className="pb-10 pt-10 sm:pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:mb-12 sm:flex-row sm:items-end">
          <div>
            <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">
              The atelier
            </p>
            <h2 className="mt-3 font-heading-2xl text-ivory-950">Signature templates</h2>
          </div>
          <Link
            href="/templates"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-sapphire-600 px-6 font-body-md font-bold text-white transition-colors hover:bg-sapphire-700"
          >
            explore all templates <Icon name="arrow_forward" size="sm" />
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.slice(0, 6).map((t, i) => (
            <TemplateCard key={t.slug} t={t} index={i} />
          ))}
        </div>

        {templates.length === 0 && (
          <div className="rounded-2xl border border-dashed border-navy-300 bg-ivory-50 p-10 text-center">
            <p className="font-body-md text-navy-800">
              Templates will appear here once the database is connected.
            </p>
            <p className="mt-1 font-body-sm text-navy-600">
              See <Link href="/live-demos" className="text-sapphire-700 underline">a sample invitation</Link> in the meantime.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}