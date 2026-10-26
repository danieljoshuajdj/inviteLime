/**
 * Small, framework-free protocol for RSVP submissions coming out of a
 * sandboxed template frame.
 *
 * The frame runs with an opaque origin (`sandbox` without `allow-same-origin`),
 * so it cannot safely call the platform API itself. It posts a request to the
 * parent, which owns the trusted wedding id and performs the same-origin fetch.
 */

import { normalizeWhatsappNumber, whatsappChatUrl } from "@/lib/phone";

export interface RsvpBridgeConfig {
  weddingId: string;
  enabled: boolean;
  preview: boolean;
  /** Customer's WhatsApp number, digits only, for the prefilled handoff. */
  whatsappNumber: string | null;
}

export interface RsvpBridgeResponse {
  name: string;
  email: string | null;
  phone: string | null;
  attendance: "attending" | "declining";
  guests: number;
  dietary: string | null;
  message: string | null;
}

export interface RsvpBridgeRequest {
  requestId: string;
  response: RsvpBridgeResponse;
}

export interface RsvpBridgeResult {
  ok: boolean;
  preview?: boolean;
  error?: string;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimmed(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function rsvpBridgeConfigFromPayload(payload: unknown): RsvpBridgeConfig | null {
  const root = recordOf(payload);
  const wedding = recordOf(root?.wedding);
  const rsvp = recordOf(root?.rsvp);
  const weddingId = trimmed(wedding?.id, 120);
  if (!weddingId) return null;
  return {
    weddingId,
    enabled: rsvp?.enabled === true,
    preview: rsvp?.preview === true || root?.mode === "demo",
    whatsappNumber: normalizeWhatsappNumber(rsvp?.whatsappNumber),
  };
}

/** Validates a template-originated message before it reaches `/api/rsvp`. */
export function parseRsvpBridgeMessage(value: unknown): RsvpBridgeRequest | null {
  const message = recordOf(value);
  if (!message || message.type !== "invite-lime:rsvp") return null;

  const requestId = trimmed(message.requestId, 120);
  const body = recordOf(message.response);
  if (!requestId || !body) return null;

  const name = trimmed(body.name, 120);
  if (!name) return null;

  const email = trimmed(body.email, 254);
  // Optional at the bridge layer so already-published template versions that
  // predate the phone field keep working. The current template requires it.
  const phone = trimmed(body.phone, 30);
  const attendance = body.attendance === "declining" ? "declining" : "attending";
  const numericGuests = Number(body.guests);
  const guests = Number.isFinite(numericGuests)
    ? Math.min(10, Math.max(1, Math.trunc(numericGuests)))
    : 1;
  const dietary = trimmed(body.dietary, 300);
  const text = trimmed(body.message, 1000);

  return {
    requestId,
    response: {
      name,
      email: email || null,
      phone: phone || null,
      attendance,
      guests,
      dietary: dietary || null,
      message: text || null,
    },
  };
}

/** Builds the message the guest sends to the couple after a Yes RSVP. */
export function buildRsvpWhatsappText(response: RsvpBridgeResponse): string {
  return [
    `Wedding RSVP — ${response.attendance === "attending" ? "Yes" : "No"}`,
    `Name: ${response.name}`,
    response.phone ? `Phone: ${response.phone}` : null,
    `Guests: ${response.guests}`,
    response.email ? `Email: ${response.email}` : null,
    response.dietary ? `Dietary: ${response.dietary}` : null,
    response.message ? `Message: ${response.message}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/** Returns the click-to-chat URL for a Yes RSVP, or null without a host number. */
export function buildRsvpWhatsappUrl(
  number: string | null | undefined,
  response: RsvpBridgeResponse
): string | null {
  if (response.attendance !== "attending") return null;
  return whatsappChatUrl(number, buildRsvpWhatsappText(response));
}
