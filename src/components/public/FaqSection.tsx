"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/shared/Icon";

export interface FaqItem {
  q: string;
  a: string;
}

export function FaqSection({ faq = [] }: { faq?: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="bg-ivory-100/70 py-10 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">
            Questions
          </p>
          <h2 className="mt-2 font-heading-2xl text-ivory-950 sm:mt-3">Frequently asked questions</h2>
        </div>

        <div className="mt-6 space-y-3 sm:mt-10">
          {faq.length === 0 ? (
            <p className="text-center font-body text-navy-700">
              FAQ coming from the site settings. Please configure content in the admin panel.
            </p>
          ) : (
            faq.map((item, i) => {
              const open = openIdx === i;
              return (
                <div
                  key={i}
                  className={cn(
                    "overflow-hidden rounded-2xl border transition-colors",
                    open ? "border-sapphire-300 bg-ivory-50 shadow-sm" : "border-navy-200 bg-ivory-50"
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-start sm:px-5 sm:py-4"
                    onClick={() => setOpenIdx(open ? null : i)}
                    aria-expanded={open}
                  >
                    <span className="font-heading-sm font-semibold text-ivory-950">{item.q}</span>
                    <Icon
                      name={open ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                      size="sm"
                      className={cn("shrink-0 text-sapphire-600 transition-transform")}
                    />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 font-body-sm leading-relaxed text-navy-800 sm:px-5 sm:pb-5">{item.a}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}