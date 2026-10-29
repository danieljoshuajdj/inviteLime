import type { Metadata } from "next";

import { invitationUrl } from "@/lib/services/weddings";
import { formDefinition, formTypeOrDefault, isBirthdayForm } from "@/lib/builder/forms";

export interface InvitationMetadataInput {
  slug: string;
  brideName?: string | null;
  groomName?: string | null;
  celebrantName?: string | null;
  formType?: string | null;
  brandName: string | null;
}

/**
 * Builds the public invitation's metadata.
 *
 * Link previews are resolved from the same publish-time brand snapshot as the
 * page itself, so a plan-covered invitation can show its studio in WhatsApp,
 * Telegram, Slack and other unfurls without exposing branding on one-time
 * invitations.
 */
export function buildInvitationMetadata(input: InvitationMetadataInput): Metadata {
  const formType = formTypeOrDefault(input.formType);
  const definition = formDefinition(formType);
  const birthday = isBirthdayForm(formType);
  const wishes = formType === "birthday_wishes";
  const couple = [input.groomName?.trim(), input.brideName?.trim()].filter(Boolean).join(" & ");
  const person = birthday
    ? input.celebrantName?.trim() || "Birthday Star"
    : couple || "Our Invitation";
  const brandName = input.brandName?.trim() || null;
  const title = brandName
    ? `${person} — ${definition.invitationLabel} by ${brandName}`
    : `${person} — ${definition.invitationLabel}`;
  const occasion = wishes
    ? "and send them your birthday wishes"
    : birthday
      ? "as they celebrate their birthday"
      : formType === "engagement"
        ? "as they celebrate their engagement"
        : "as they celebrate their wedding";
  const description = brandName
    ? `Join ${person} ${occasion}. Presented by ${brandName}.`
    : `Join ${person} ${occasion}.`;
  const url = invitationUrl(input.slug);

  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: brandName ?? "Invite Lime",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
