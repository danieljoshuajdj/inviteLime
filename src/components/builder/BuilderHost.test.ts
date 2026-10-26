import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultWeddingData, type WeddingData } from "@/lib/builder/defaults";

import { BuilderHost, type BuilderProps } from "./BuilderHost";

function navMarkup(initialData: WeddingData): string {
  const html = renderToStaticMarkup(
    createElement(BuilderHost, {
      token: "token",
      initialData,
      draftEmail: null,
      template: { id: "t1", name: "Testing", slug: "testing", pricePaise: 0, currency: "INR", versionId: "v1" },
      devBypassEnabled: false,
    } satisfies BuilderProps)
  );
  const start = html.indexOf('<nav aria-label="Progress"');
  const end = html.indexOf("</nav>", start);
  return html.slice(start, end);
}

describe("builder stepper gating", () => {
  it("starts with no ticks and no steps you can jump to", () => {
    const nav = navMarkup(defaultWeddingData());

    // The reported bug: steps ticked off purely by being before the cursor.
    expect(nav).not.toContain("bg-success");
    expect(nav).toContain("bg-primary"); // only the current step is highlighted

    const buttons = nav.match(/<button\b[^>]*>/g) ?? [];
    const disabled = nav.match(/<button\b[^>]*\sdisabled[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3);
    // Only step 1 (the one you are on) is clickable; the other two are not,
    // so there is no way to click ahead and forge ticks.
    expect(disabled).toHaveLength(2);
  });

  it("does not tick a step whose content is missing, even with full details", () => {
    // Names are filled but the wedding is not: step 1 must stay unticked.
    const partial = { ...defaultWeddingData(), brideName: "Meera", groomName: "Aarav" };
    const nav = navMarkup(partial);
    expect(nav).not.toContain("bg-success");
  });
});
