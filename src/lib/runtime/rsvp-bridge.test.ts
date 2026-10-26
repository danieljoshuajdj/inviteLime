import { describe, expect, it } from "vitest";

import {
  buildRsvpWhatsappText,
  buildRsvpWhatsappUrl,
  parseRsvpBridgeMessage,
  rsvpBridgeConfigFromPayload,
} from "./rsvp-bridge";

const payload = {
  mode: "live",
  wedding: { id: "11111111-1111-4111-8111-111111111111" },
  rsvp: { enabled: true, preview: false, whatsappNumber: "+91 98765 43210" },
};

describe("rsvpBridgeConfigFromPayload", () => {
  it("reads the trusted wedding id and live settings from the payload", () => {
    expect(rsvpBridgeConfigFromPayload(payload)).toEqual({
      weddingId: "11111111-1111-4111-8111-111111111111",
      enabled: true,
      preview: false,
      whatsappNumber: "919876543210",
    });
  });

  it("marks demo and preview payloads read-only", () => {
    expect(rsvpBridgeConfigFromPayload({ ...payload, mode: "demo" })?.preview).toBe(true);
    expect(
      rsvpBridgeConfigFromPayload({ ...payload, rsvp: { enabled: true, preview: true } })?.preview
    ).toBe(true);
  });

  it("rejects payloads without a wedding id", () => {
    expect(rsvpBridgeConfigFromPayload({ ...payload, wedding: {} })).toBeNull();
  });
});

describe("parseRsvpBridgeMessage", () => {
  it("keeps only sanitised RSVP fields", () => {
    expect(
      parseRsvpBridgeMessage({
        type: "invite-lime:rsvp",
        requestId: "rsvp-1",
        response: {
          name: "  Guest  ",
          email: "",
          phone: " +91 98765 43210 ",
          attendance: "attending",
          guests: "3",
          dietary: " Vegan ",
          message: "  See you there  ",
          weddingId: "not-trusted",
        },
      })
    ).toEqual({
      requestId: "rsvp-1",
      response: {
        name: "Guest",
        email: null,
        phone: "+91 98765 43210",
        attendance: "attending",
        guests: 3,
        dietary: "Vegan",
        message: "See you there",
      },
    });
  });

  it("clamps guest counts and defaults missing optional fields", () => {
    const parsed = parseRsvpBridgeMessage({
      type: "invite-lime:rsvp",
      requestId: "rsvp-2",
      response: { name: "Guest", guests: 99 },
    });
    expect(parsed?.response.guests).toBe(10);
    expect(parsed?.response.email).toBeNull();
    expect(parsed?.response.phone).toBeNull();
    expect(parsed?.response.dietary).toBeNull();
  });

  it("rejects malformed and unrelated messages", () => {
    expect(parseRsvpBridgeMessage({ type: "invite-lime:data" })).toBeNull();
    expect(
      parseRsvpBridgeMessage({ type: "invite-lime:rsvp", requestId: "x", response: { name: "" } })
    ).toBeNull();
  });
});

describe("WhatsApp handoff", () => {
  const response = {
    name: "Priya Sharma",
    email: "priya@example.com",
    phone: "+91 98765 43210",
    attendance: "attending" as const,
    guests: 3,
    dietary: "Vegetarian",
    message: "See you there",
  };

  it("prefills the guest name, phone and count", () => {
    const text = buildRsvpWhatsappText(response);
    expect(text).toContain("Name: Priya Sharma");
    expect(text).toContain("Phone: +91 98765 43210");
    expect(text).toContain("Guests: 3");
  });

  it("builds a click-to-chat URL for the customer number", () => {
    const url = buildRsvpWhatsappUrl("+91 98765 43210", response);
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(decodeURIComponent(url!)).toContain("Name: Priya Sharma");
  });

  it("has no handoff without a configured number or for a decline", () => {
    expect(buildRsvpWhatsappUrl("", response)).toBeNull();
    expect(buildRsvpWhatsappUrl("919876543210", { ...response, attendance: "declining" })).toBeNull();
  });
});
