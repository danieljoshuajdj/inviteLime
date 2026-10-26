/** Phone helpers shared by the invitation runtime and the RSVP bridge. */

/**
 * WhatsApp click-to-chat needs the full international number as digits, with
 * no `+`, spaces or punctuation. Returns null for input that is too short or
 * too long to be a real number.
 */
export function normalizeWhatsappNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  // A common way to write an international prefix; WhatsApp wants 91…, not 0091…
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/** Builds a WhatsApp chat URL to `number`, optionally with prefilled text. */
export function whatsappChatUrl(number: unknown, text?: string | null): string | null {
  const digits = normalizeWhatsappNumber(number);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Whether a free-form phone field has enough digits to be plausible. */
export function hasPhoneDigits(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
