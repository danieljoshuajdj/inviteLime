import type { Metadata } from "next";

import { FaqSection } from "@/components/public/FaqSection";
import { getPublicSiteData } from "@/lib/services/site-settings";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to the most asked questions about Invite Lime wedding invitations.",
};

export default async function FaqPage() {
  let faq: Array<{ q: string; a: string }> = [];
  try {
    const site = await getPublicSiteData();
    faq = (site?.faq ?? []) as Array<{ q: string; a: string }>;
  } catch {
    faq = [];
  }

  return (
    <div className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">Help center</p>
          <h1 className="mt-3 font-heading-3xl text-ivory-950">Frequently asked questions</h1>
          <p className="mt-4 font-body-lg text-navy-800">
            Everything you need to know before creating your invitation.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <FaqSection faq={faq} />
      </div>
    </div>
  );
}