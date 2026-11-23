import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultWeddingData, type WeddingData } from "@/lib/builder/defaults";

import { StepDetails } from "./StepDetails";

function render(data: WeddingData, showPhotos: boolean) {
  return renderToStaticMarkup(
    createElement(StepDetails, {
      token: "token",
      data,
      onChange: () => {},
      onNext: () => {},
      showPhotos,
    })
  );
}

describe("StepDetails template photo capability", () => {
  it("shows the photo and music sections when the template accepts photos", () => {
    const html = render(defaultWeddingData(), true);

    expect(html).toContain("Photos &amp; music");
    expect(html).toContain("Include Photos?");
    expect(html).toContain("Include Photo Gallery?");
  });

  it("keeps only the background song when the template has no photos", () => {
    const html = render(defaultWeddingData({ includePhotos: true, includeGallery: true }), false);

    expect(html).not.toContain("Photos &amp; music");
    expect(html).not.toContain("Include Photos?");
    expect(html).not.toContain("Include Photo Gallery?");
    expect(html).not.toContain("Bride&#x27;s photo");
    expect(html).not.toContain("Upload photos");
    expect(html).toContain("Background song");
  });

  it("offers a song instead of birthday photos when the template has no photos", () => {
    const html = render(
      defaultWeddingData({
        formType: "birthday_wishes",
        includePhotos: true,
        includeGallery: true,
      }),
      false
    );

    expect(html).not.toContain("Include Photos?");
    expect(html).not.toContain("Include Photo Gallery?");
    expect(html).not.toContain("Main image");
    expect(html).toContain("Background song");
  });
});
