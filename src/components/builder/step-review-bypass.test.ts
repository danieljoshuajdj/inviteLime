import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// StepReview is a client component that calls useRouter; there is no app
// router context outside Next, so stub the hooks it uses.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/script", () => ({ default: () => null }));

import { StepReview } from "./StepReview";
import type { WeddingData } from "@/lib/builder/defaults";

const data = {
  brideName: "Meera",
  groomName: "Aarav",
  weddingDate: "2027-02-14",
  events: [],
  gallery: [],
} as unknown as WeddingData;

const template = { id: "t1", name: "Testing", slug: "testing", pricePaise: 40000, currency: "INR", versionId: "v1" };
const noop = () => {};

function render(devBypassEnabled: boolean): string {
  return renderToStaticMarkup(
    createElement(StepReview, {
      token: "tok",
      data,
      email: "heydonotify@gmail.com",
      onEmailChange: noop,
      template,
      onBack: noop,
      onSaved: noop,
      devBypassEnabled,
    })
  );
}

describe("StepReview dev bypass panel", () => {
  it("is hidden when the server flag is off", () => {
    expect(render(false)).not.toContain("Dev only");
  });

  it("shows the shortcut without removing the normal pay path", () => {
    const html = render(true);
    expect(html).toContain("Dev only");
    expect(html).toContain("Pay &amp; publish");
  });
});
