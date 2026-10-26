/**
 * Small bridge used by templates for actions that do not work reliably inside
 * a sandboxed iframe: opening a map in a new tab and dialling a phone number.
 *
 * The frame is deliberately opaque-origin, so it cannot navigate the top-level
 * platform page. It sends a message; the host validates the scheme and performs
 * the action. Only `tel:` and http(s) URLs are accepted.
 */
export const EXTERNAL_LINK_MESSAGE = "invite-lime:external-link";

export interface ExternalLinkRequest {
  type: typeof EXTERNAL_LINK_MESSAGE;
  href: string;
}

export function parseExternalLinkMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  if (candidate.type !== EXTERNAL_LINK_MESSAGE) return null;
  if (typeof candidate.href !== "string") return null;

  const href = candidate.href.trim();
  if (href.startsWith("tel:")) {
    const number = href.slice(4).replace(/[^\d+]/g, "");
    return number.length >= 5 ? `tel:${number}` : null;
  }

  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
