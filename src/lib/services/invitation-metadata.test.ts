import { describe, expect, it } from "vitest";

import { buildInvitationMetadata } from "@/lib/services/invitation-metadata";

const invitation = {
  slug: "khan-weds-maya",
  brideName: "Maya",
  groomName: "Khan",
};

describe("invitation link metadata", () => {
  it("adds the studio brand to a plan-covered invitation preview", () => {
    const metadata = buildInvitationMetadata({
      ...invitation,
      brandName: "Kingpin Wedding company",
    });

    expect(metadata.title).toBe(
      "Khan & Maya — Wedding Invitation by Kingpin Wedding company"
    );
    expect(metadata.description).toBe(
      "Join Khan & Maya as they celebrate their wedding. Presented by Kingpin Wedding company."
    );
    expect(metadata.openGraph).toMatchObject({
      title: "Khan & Maya — Wedding Invitation by Kingpin Wedding company",
      description:
        "Join Khan & Maya as they celebrate their wedding. Presented by Kingpin Wedding company.",
      siteName: "Kingpin Wedding company",
    });
    expect(metadata.twitter).toMatchObject({
      title: "Khan & Maya — Wedding Invitation by Kingpin Wedding company",
      description:
        "Join Khan & Maya as they celebrate their wedding. Presented by Kingpin Wedding company.",
    });
    expect(metadata.openGraph?.url).toContain("/w/khan-weds-maya");
    expect(metadata.alternates?.canonical).toContain("/w/khan-weds-maya");
  });

  it("keeps one-time invitations unbranded", () => {
    const metadata = buildInvitationMetadata({
      ...invitation,
      brandName: null,
    });

    expect(metadata.title).toBe("Khan & Maya — Wedding Invitation");
    expect(metadata.description).toBe(
      "Join Khan & Maya as they celebrate their wedding."
    );
    expect(metadata.openGraph).toMatchObject({
      title: "Khan & Maya — Wedding Invitation",
      description: "Join Khan & Maya as they celebrate their wedding.",
      siteName: "Invite Lime",
    });
    expect(JSON.stringify(metadata)).not.toContain("Kingpin");
  });
});
