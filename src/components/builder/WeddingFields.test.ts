import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultWeddingData } from "@/lib/builder/defaults";
import { toDateInputValue } from "@/lib/utils";

import { WeddingFields } from "./sections/WeddingFields";

function markup(
  data = defaultWeddingData({
    events: [
      { name: "Mehendi", date: null, time: null, venue: null, address: null, mapsUrl: null, description: null },
    ],
  })
): string {
  return renderToStaticMarkup(
    createElement(WeddingFields, {
      data,
      onChange: () => {},
    })
  );
}

describe("WeddingFields date and time bounds", () => {
  it("renders the date and time pickers", () => {
    const html = markup();
    expect(html).toContain('type="date"');
    expect(html).toContain('type="time"');
  });

  it("never renders today's bound on the server", () => {
    // `min` comes from the visitor's clock, which the server does not have.
    // Rendering it here would make the server HTML and the hydrating render
    // disagree, which React reports as a hydration attribute mismatch.
    const html = markup();
    expect(html).not.toContain("min=");
    expect(html).not.toContain(toDateInputValue());
  });
});
