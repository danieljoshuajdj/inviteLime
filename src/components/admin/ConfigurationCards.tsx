import Link from "next/link";

import { Icon, type IconName } from "@/components/shared/Icon";

interface ConfigurationSection {
  href: string;
  label: string;
  description: string;
  icon: IconName;
}

const sections: ConfigurationSection[] = [
  {
    href: "/admin/media",
    label: "Media",
    description:
      "Demo photo packs for couples, venues and galleries, reused across template previews.",
    icon: "image",
  },
  {
    href: "/admin/music",
    label: "Music",
    description:
      "Background soundtracks guests can choose while personalising their invitation.",
    icon: "music_note",
  },
  {
    href: "/admin/details",
    label: "Details",
    description:
      "Sample couples, venues and event schedules that bring template demos to life.",
    icon: "text_fields",
  },
  {
    href: "/admin/categories",
    label: "Categories",
    description:
      "The event forms every template belongs to, from weddings to birthdays.",
    icon: "category",
  },
  {
    href: "/admin/tags",
    label: "Tags",
    description:
      "Labels that help customers discover templates by style, mood and occasion.",
    icon: "tune",
  },
];

/**
 * The five shared-library areas. Each card is one link, so the whole surface
 * is clickable and keyboard-focusable without nested interactive elements.
 *
 * Layout: one column on phones, two on small tablets, three on laptops, then
 * as many fluid columns as the available width allows (four at 1440px, five on
 * large displays). The parent caps the content width so ultrawide screens do
 * not stretch five cards into unreadably wide panels.
 */
export function ConfigurationCards() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] 2xl:gap-5">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="group flex h-full min-h-[12rem] flex-col rounded-2xl border border-outline-variant bg-surface p-5 transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-secondary/45 hover:bg-surface-container-lowest hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary transition-colors duration-200 group-hover:bg-secondary group-hover:text-white">
            <Icon name={section.icon} size="md" />
          </span>
          <span className="mt-4 font-heading-md font-semibold !text-on-surface">
            {section.label}
          </span>
          <span className="mt-1 flex-1 font-body-sm text-on-surface-variant">
            {section.description}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 font-body-xs font-semibold text-secondary">
            Open section
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              <Icon name="arrow_forward" size="xs" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
