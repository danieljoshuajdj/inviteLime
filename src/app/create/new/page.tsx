import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StartHost } from "@/components/builder/StartHost";

export const metadata: Metadata = {
  title: "Create your invitation",
  description: "Start your wedding invitation — no sign-in required.",
};

interface CreateNewPageProps {
  searchParams: Promise<{ template?: string }>;
}

export default async function CreateNewPage({ searchParams }: CreateNewPageProps) {
  const { template } = await searchParams;

  // The old chooser screen is gone. Generic creation starts at the template
  // library; only template-specific links reach this route and start directly.
  if (!template) redirect("/create/browse");

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <StartHost initialTemplateSlug={template} />
    </div>
  );
}
