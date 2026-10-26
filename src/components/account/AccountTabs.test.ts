import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountTabs } from "./AccountTabs";

function markup(isPlanner: boolean) {
  return renderToStaticMarkup(createElement(AccountTabs, { active: "profile", isPlanner }));
}

describe("AccountTabs", () => {
  it("keeps the three planner tabs on a single equal-width row", () => {
    const html = markup(true);
    expect(html).toContain("Profile");
    expect(html).toContain("Brand details");
    expect(html).toContain("Planner plan");
    // Three `flex-1` tabs share the width; the old `flex-wrap` layout pushed
    // the last tab onto a second line on phones.
    expect((html.match(/flex-1/g) ?? []).length).toBe(3);
    expect(html).not.toContain("flex-wrap");
    expect(html).not.toContain("whitespace-normal");
  });

  it("shows only Profile to customers", () => {
    const html = markup(false);
    expect(html).toContain("Profile");
    expect(html).not.toContain("Brand details");
    expect(html).not.toContain("Planner plan");
  });
});
