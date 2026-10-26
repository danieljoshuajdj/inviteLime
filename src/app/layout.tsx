import type { Metadata } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";
import { cn } from "@/lib/utils";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Invite Lime | Haute Wedding Invitation Platform",
    template: "%s | Invite Lime",
  },
  description:
    "Design an enchanting digital invitation in minutes. Choose from couture animated templates, add ceremonies, music and registry, and share a personalized link that opens instantly on every smartphone.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body
        className={cn(
          playfair.variable,
          plusJakarta.variable,
          "min-h-full bg-surface font-body-md text-body-md text-on-surface antialiased"
        )}
      >
        {children}
      </body>
    </html>
  );
}