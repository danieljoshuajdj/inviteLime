"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/shared/Button";
import { GuestSettingsFields } from "@/components/shared/GuestSettingsFields";
import { Icon, type IconName } from "@/components/shared/Icon";
import { CelebrantFields } from "@/components/builder/sections/CelebrantFields";
import { CelebrationFields } from "@/components/builder/sections/CelebrationFields";
import { CoupleFields } from "@/components/builder/sections/CoupleFields";
import { EventMediaFields } from "@/components/builder/sections/EventMediaFields";
import { MediaFields } from "@/components/builder/sections/MediaFields";
import { WeddingFields } from "@/components/builder/sections/WeddingFields";
import type { WeddingData } from "@/lib/builder/defaults";
import { formDefinition, formTypeOf, isBirthdayForm } from "@/lib/builder/forms";
import { validateDetails } from "@/lib/builder/validation";
import { useClientNow } from "@/lib/use-client-now";

interface Props {
  token: string;
  data: WeddingData;
  onChange: (patch: Partial<WeddingData> | ((prev: WeddingData) => Partial<WeddingData>)) => void;
  onNext: () => void;
}

interface SectionProps {
  id: string;
  index: number;
  title: string;
  description: string;
  icon: IconName;
  children: ReactNode;
}

function DetailsSection({ id, index, title, description, icon, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6"
    >
      <div className="flex items-start gap-3 border-b border-outline-variant pb-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name={icon} size="md" />
        </span>
        <div className="min-w-0">
          <p className="font-body-xs font-semibold uppercase tracking-[0.16em] text-secondary">
            Part {index}
          </p>
          <h2 id={`${id}-title`} className="font-heading-md font-semibold !text-on-surface">
            {title}
          </h2>
          <p className="mt-1 font-body-xs text-on-surface-variant">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * The whole invitation brief in one step: couple, schedule, guest options and
 * media live on a single page so nothing is buried behind extra clicks. Only
 * the couple names, date and venue are required — everything else is optional
 * and can be changed from the account after publishing.
 */
export function StepDetails({ token, data, onChange, onNext }: Props) {
  const [error, setError] = useState<string | null>(null);
  const now = useClientNow();
  const formType = formTypeOf(data);
  const birthday = isBirthdayForm(formType);
  const wishes = formType === "birthday_wishes";
  const definition = formDefinition(formType);

  function handleNext() {
    const issue = validateDetails(data, formType, now);
    if (issue) {
      showError(issue.message, issue.sectionId);
      return;
    }
    setError(null);
    onNext();
  }

  /** Brings the offending section into view on this long single-page form. */
  function showError(message: string, sectionId: string) {
    setError(message);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  interface DetailsSectionDef {
    id: string;
    title: string;
    description: string;
    icon: IconName;
    children: ReactNode;
  }

  const sections: DetailsSectionDef[] = birthday
    ? [
        {
          id: "celebrant-details",
          title: "Birthday person",
          description: wishes
            ? "Who the wish is for, the birthday number and the message guests will read."
            : "Who the celebration is for. This name appears on the invitation and every guest message.",
          icon: "celebration",
          children: <CelebrantFields data={data} onChange={onChange} formType={formType} />,
        },
        ...(wishes
          ? []
          : [
              {
                id: "when-and-where",
                title: "When & where",
                description:
                  "The celebration date powers your countdown, maps and invitation expiry.",
                icon: "calendar_month" as IconName,
                children: <CelebrationFields data={data} onChange={onChange} />,
              },
            ]),
        {
          id: "photos",
          title: "Photos",
          description: wishes
            ? "Optional — one main image and up to three gallery photos."
            : "Optional — a main image and a gallery of your favourite moments (15MB max per image).",
          icon: "image",
          children: (
            <EventMediaFields
              token={token}
              data={data}
              onChange={onChange}
              maxGallery={wishes ? 3 : undefined}
            />
          ),
        },
      ]
    : [
        {
          id: "couple-details",
          title: "Couple details",
          description:
            "These names appear on your invitation, your link and every guest message.",
          icon: "diversity_1",
          children: <CoupleFields data={data} onChange={onChange} />,
        },
        {
          id: "when-and-where",
          title: "When & where",
          description: "The date powers your countdown, maps and invitation expiry.",
          icon: "calendar_month",
          children: (
            <WeddingFields data={data} onChange={onChange} formType={formType} />
          ),
        },
        {
          id: "guest-settings",
          title: "Guest settings",
          description:
            "Optional dress code and RSVP options. You can change these later without changing your link.",
          icon: "celebration",
          children: (
            <GuestSettingsFields
              dress={data.dress}
              rsvpEnabled={data.rsvpEnabled}
              rsvpWhatsapp={data.rsvpWhatsapp}
              onChange={onChange}
              idPrefix="builder"
            />
          ),
        },
        {
          id: "photos-and-music",
          title: "Photos & music",
          description:
            "Add up to 15MB per image and a soundtrack (10MB max). Choose a track from our library, or upload your own.",
          icon: "image",
          children: <MediaFields token={token} data={data} onChange={onChange} />,
        },
      ];

  return (
    <section aria-labelledby="step-details-title">
      <div className="mx-auto max-w-3xl">
        <p className="flex items-center gap-2 font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          <Icon name="edit" size="sm" /> Step 1 · Invitation details
        </p>
        <h1 id="step-details-title" className="mt-2 font-heading-2xl !text-on-surface">
          {birthday ? `Create your ${definition.label.toLowerCase()} invitation` : "Create your invitation"}
        </h1>
        <p className="mt-2 font-body text-on-surface-variant">
          {wishes
            ? "Tell us who the birthday wish is for, the age being celebrated and your message. The images are optional."
            : birthday
              ? "Tell us who you are celebrating, when and where, and add a few photos. Only the name, date and venue are required."
              : "Tell us about the couple, the celebration, your guests and the mood — all in one place. Only the names, date and venue are required."}
        </p>

        <div className="mt-8 flex flex-col gap-6">
          {sections.map((section, index) => (
            <DetailsSection
              key={section.id}
              id={section.id}
              index={index + 1}
              title={section.title}
              description={section.description}
              icon={section.icon}
            >
              {section.children}
            </DetailsSection>
          ))}
        </div>

        {error && (
          <p
            className="mt-6 flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error"
            role="alert"
          >
            <Icon name="error" size="sm" /> {error}
          </p>
        )}

        <div className="mt-8 flex justify-end">
          <Button size="xl" icon="visibility" iconAfter="arrow_forward" onClick={handleNext}>
            Preview invitation
          </Button>
        </div>
      </div>
    </section>
  );
}
