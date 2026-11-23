import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultWeddingData, type WeddingData } from "@/lib/builder/defaults";

import { MediaFields } from "./MediaFields";

function render(data: WeddingData, showPhotos?: boolean) {
  return renderToStaticMarkup(
    createElement(MediaFields, {
      data,
      onChange: () => {},
      showPhotos,
    })
  );
}

describe("MediaFields switches", () => {
  it("starts with photos and the gallery hidden but music unchanged", () => {
    const html = render(defaultWeddingData());

    expect(html).toContain("Include Photos?");
    expect(html).toContain("Include Photo Gallery?");
    expect(html).not.toContain("Bride&#x27;s photo");
    expect(html).not.toContain("Photo gallery");
    expect(html).not.toContain("Upload photos");
    expect(html).toContain("Background song");
  });

  it("hides every photo control but keeps the song when photos are disabled", () => {
    const html = render(
      defaultWeddingData({ includePhotos: true, includeGallery: true }),
      false
    );

    expect(html).not.toContain("Include Photos?");
    expect(html).not.toContain("Include Photo Gallery?");
    expect(html).not.toContain("Bride&#x27;s photo");
    expect(html).not.toContain("Groom&#x27;s photo");
    expect(html).not.toContain("Couple&#x27;s photo");
    expect(html).not.toContain("Photo gallery");
    expect(html).not.toContain("Upload photos");
    expect(html).toContain("Background song");
    expect(html).toContain("Pick a track below, or upload your own.");
  });

  it("reveals each upload section independently", () => {
    const photos = render(defaultWeddingData({ includePhotos: true }));
    expect(photos).toContain("Bride&#x27;s photo");
    expect(photos).toContain("Groom&#x27;s photo");
    expect(photos).toContain("Couple&#x27;s photo");
    expect(photos).not.toContain("Photo gallery");

    const gallery = render(defaultWeddingData({ includeGallery: true }));
    expect(gallery).not.toContain("Bride&#x27;s photo");
    expect(gallery).toContain("Photo gallery");
    expect(gallery).toContain("0/6 Photos Uploaded");
    expect(gallery).toContain("Upload photos");
  });

  it("shows the counter and remove/replace actions for uploaded photos", () => {
    const html = render(
      defaultWeddingData({
        includeGallery: true,
        gallery: [{ role: "gallery", url: "/media/one.jpg", name: "one.jpg" }],
      })
    );

    expect(html).toContain("1/6 Photos Uploaded");
    expect(html).toContain("Replace photo");
    expect(html).toContain("Remove photo");
  });
});
