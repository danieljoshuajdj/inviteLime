import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import { PublicNav } from "./PublicNav";

function markup(props: { signedIn: boolean; dashboardHref?: string }) {
  return renderToStaticMarkup(createElement(PublicNav, props));
}

describe("PublicNav account action", () => {
  it("offers sign-in to visitors without a session", () => {
    const html = markup({ signedIn: false });
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("Dashboard");
  });

  it("links a signed-in customer to the account dashboard", () => {
    const html = markup({ signedIn: true });
    expect(html).not.toContain("Sign in");
    expect(html).toContain('href="/app/invitations"');
    expect(html).toContain("Dashboard");
  });

  it("links an admin to the admin dashboard", () => {
    const html = markup({ signedIn: true, dashboardHref: "/admin/dashboard" });
    expect(html).toContain('href="/admin/dashboard"');
    expect(html).toContain("Dashboard");
  });
});
