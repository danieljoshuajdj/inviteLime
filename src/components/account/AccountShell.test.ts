import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/app/account" }));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

import { AccountShell } from "./AccountShell";

// Same component, with `children` made optional so it can be passed the way
// `createElement` expects rather than as a prop.
type ShellProps = {
  user: { email: string; name: string };
  isAdmin: boolean;
  children?: React.ReactNode;
};

const Shell = AccountShell as unknown as React.ComponentType<ShellProps>;

function markup() {
  return renderToStaticMarkup(
    createElement(
      Shell,
      { user: { email: "planner@example.com", name: "Planner" }, isAdmin: false },
      createElement("p", null, "content")
    )
  );
}

/** Class list rendered on the sidebar link pointing at `href`. */
function linkClasses(html: string, href: string): string {
  for (const tag of html.match(/<a\s[^>]*>/g) ?? []) {
    if (tag.includes(`href="${href}"`)) {
      return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
    }
  }
  return "";
}

const SHELL_LINKS = ["/app/explore", "/app/invitations", "/app/favorites", "/app/account"];

function activeLinks(html: string): string[] {
  return SHELL_LINKS.filter((href) => linkClasses(html, href).includes("bg-primary"));
}

/** Section links that render `aria-current="page"` (desktop and mobile bars). */
function currentLinks(html: string): string[] {
  const anchors = html.match(/<a\s[^>]*>/g) ?? [];
  return SHELL_LINKS.filter((href) =>
    anchors.some((tag) => tag.includes(`href="${href}"`) && tag.includes('aria-current="page"'))
  );
}

describe("AccountShell active section", () => {
  beforeEach(() => {
    state.pathname = "/app/account";
  });

  it("names the account section Settings", () => {
    expect(markup()).toContain("Settings");
  });

  it("no longer lists planner brand and plan as main navigation tabs", () => {
    const html = markup();
    expect(html).not.toContain('href="/app/account/brand"');
    expect(html).not.toContain('href="/app/account/plan"');
  });

  it("marks only Settings on the account page", () => {
    expect(activeLinks(markup())).toEqual(["/app/account"]);
  });

  it("keeps Settings active on the planner brand page", () => {
    // Brand details moved inside Settings, so the Settings tab stays selected.
    state.pathname = "/app/account/brand";
    expect(activeLinks(markup())).toEqual(["/app/account"]);
  });

  it("keeps Settings active on the planner plan page", () => {
    state.pathname = "/app/account/plan";
    expect(activeLinks(markup())).toEqual(["/app/account"]);
  });

  it("marks the current section in the mobile bottom nav too", () => {
    // Both the desktop sidebar and the mobile bottom bar render the section,
    // so exactly two anchors carry aria-current for the active href.
    const html = markup();
    expect(currentLinks(html)).toEqual(["/app/account"]);

    state.pathname = "/app/account/brand";
    expect(currentLinks(markup())).toEqual(["/app/account"]);
  });
});
