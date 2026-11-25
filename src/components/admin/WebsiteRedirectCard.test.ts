import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WebsiteRedirectCard } from "./WebsiteRedirectCard";

describe("WebsiteRedirectCard", () => {
  it("shows the saved destination, the permanent path and the save control", () => {
    const html = renderToStaticMarkup(
      createElement(WebsiteRedirectCard, { initialUrl: "https://mywebsite.com/" })
    );

    expect(html).toContain("Visit Website Redirect");
    expect(html).toContain("Website URL");
    expect(html).toContain("https://mywebsite.com/");
    expect(html).toContain("/visit-website");
    expect(html).toContain("Save Changes");
    expect(html).toContain("Open current destination");
  });

  it("explains the safe unconfigured state", () => {
    const html = renderToStaticMarkup(
      createElement(WebsiteRedirectCard, { initialUrl: null })
    );

    expect(html).toContain("No destination configured yet");
    expect(html).toContain("website unavailable");
    expect(html).not.toContain("Open current destination");
  });
});
