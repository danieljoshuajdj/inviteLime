import type { Metadata } from "next";

import { StartBlank } from "@/components/builder/StartBlank";

export const metadata: Metadata = {
  title: "Start with a blank template",
  robots: { index: false, follow: false },
};

export default function StartBlankPage() {
  return <StartBlank />;
}