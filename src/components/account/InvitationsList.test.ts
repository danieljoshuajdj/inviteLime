import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { InvitationsList, type InvitationItem } from "./InvitationsList";

const item: InvitationItem = {
  id: "wedding-1",
  slug: "ananya-rohan",
  bride: "Ananya",
  groom: "Rohan",
  date: "2026-12-12",
  venue: "The Leela Palace",
  status: "active",
  expiration: null,
  views: 24,
  attending: 8,
  templateName: "Ivory Lotus",
  url: "https://invite.example.com/w/ananya-rohan",
};

function markup(canDelete = false) {
  return renderToStaticMarkup(
    createElement(InvitationsList, { items: [item], canDelete })
  );
}

describe("InvitationsList", () => {
  it("stacks the stats in one column on phones", () => {
    const html = markup();
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:grid-cols-3");
  });

  it("does not offer deletion to customers", () => {
    expect(markup(false)).not.toContain(">Delete<");
  });

  it("offers planners a typed permanent delete action", () => {
    expect(markup(true)).toContain(">Delete<");
  });
});
