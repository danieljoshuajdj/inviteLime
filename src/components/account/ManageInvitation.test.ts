import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ManageInvitation } from "./ManageInvitation";

const invitation = {
  id: "wedding-1",
  slug: "ananya-rohan",
  couple: "Rohan & Ananya",
  date: "12 December 2026",
  venue: "The Leela Palace, Bengaluru",
  status: "active",
  templateName: "Ivory Lotus",
  views: 24,
  attendingCount: 8,
  rsvpCount: 11,
  url: "https://invite.example.com/w/ananya-rohan",
  rsvpToggle: true,
};

function markup() {
  return renderToStaticMarkup(
    createElement(ManageInvitation, { invitation, rsvps: [] })
  );
}

describe("ManageInvitation quick actions", () => {
  it("links Edit content to the invitation editor", () => {
    expect(markup()).toContain('href="/app/invitations/wedding-1/edit"');
  });

  it("renders the QR card download action with a QR canvas ready to export", () => {
    const html = markup();
    expect(html).toContain("Download QR card");
    expect(html).toContain("<canvas");
  });

  it("hides permanent deletion from customers", () => {
    expect(markup()).not.toContain(">Delete<");
  });

  it("offers planners permanent deletion next to the quick actions", () => {
    const html = renderToStaticMarkup(
      createElement(ManageInvitation, { invitation, rsvps: [], canDelete: true })
    );
    expect(html).toContain(">Delete<");
  });
});
