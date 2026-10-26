import type { Metadata } from "next";

import { invitationUrl } from "@/lib/services/weddings";

export interface InvitationMetadataInput {
  slug: string;
  brideName: string;
  groomName: string;
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
  const couple = `${input.groomName} & ${input.brideName}`;
  const brandName = input.brandName?.trim() || null;
  const title = brandName
    ? `${couple} — Wedding Invitation by ${brandName}`
    : `${couple} — Wedding Invitation`;
  const description = brandName
    ? `Join ${couple} as they celebrate their wedding. Presented by ${brandName}.`
    : `Join ${couple} as they celebrate their wedding.`;
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
