import type { Metadata } from "next";

import { StartBlank } from "@/components/builder/StartBlank";
import { requireSignedIn } from "@/lib/services/auth-guard";

export const metadata: Metadata = {
  title: "Start with a blank template",
  robots: { index: false, follow: false },
};

export default async function StartBlankPage() {
  await requireSignedIn("/create/blank");

  return <StartBlank />;
}
