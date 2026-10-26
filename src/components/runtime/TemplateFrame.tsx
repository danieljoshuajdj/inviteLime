"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/shared/Icon";
import {
  buildRsvpWhatsappUrl,
  parseRsvpBridgeMessage,
  rsvpBridgeConfigFromPayload,
  type RsvpBridgeConfig,
  type RsvpBridgeResult,
} from "@/lib/runtime/rsvp-bridge";
import { parseExternalLinkMessage } from "@/lib/runtime/external-link";

interface Props {
  /** Fully bound template document (payload + base href already injected). */
  html: string;
  /** Standardized runtime payload, re-broadcast to the frame on load. */
  payload: unknown;
  title: string;
  /** Shown while the frame boots and as a no-JS fallback. */
  fallbackHref?: string;
  fallbackLabel?: string;
  className?: string;
}

/**
 * Hosts an uploaded template package.
 *
 * Security posture (see "TEMPLATE SECURITY" in the platform prompt):
 * * `srcDoc` keeps the markup on the platform origin but `sandbox` omits
 *   `allow-same-origin`, so the template runs with an opaque origin: it cannot
 *   read cookies, localStorage or call the platform's private APIs.
 * * `referrerPolicy="no-referrer"` avoids leaking invitation URLs.
 * * Only public invitation data is injected (never email, orders or ids).
 */
export function TemplateFrame({ html, payload, title, fallbackHref, fallbackLabel, className }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rsvpRef = useRef<RsvpBridgeConfig | null>(null);
  // Readiness is derived from which document has loaded: when `html` changes
  // (a new template version), the boot overlay shows until the new load fires.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === html;

  useEffect(() => {
    rsvpRef.current = rsvpBridgeConfigFromPayload(payload);
  }, [payload]);

  useEffect(() => {
    function reply(result: RsvpBridgeResult, requestId: string) {
      try {
        frameRef.current?.contentWindow?.postMessage(
          { type: "invite-lime:rsvp:result", requestId, ...result },
          "*"
        );
      } catch {
        // The frame can disappear while the request is in flight.
      }
    }

    async function onMessage(event: MessageEvent) {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const externalHref = parseExternalLinkMessage(event.data);
      if (externalHref) {
        if (externalHref.startsWith("tel:")) {
          window.location.assign(externalHref);
        } else {
          window.open(externalHref, "_blank", "noopener,noreferrer");
        }
        return;
      }

      const request = parseRsvpBridgeMessage(event.data);
      if (!request) return;

      const rsvp = rsvpRef.current;
      if (!rsvp?.enabled) {
        reply({ ok: false, error: "RSVPs are closed for this invitation." }, request.requestId);
        return;
      }
      if (rsvp.preview) {
        reply({ ok: true, preview: true }, request.requestId);
        return;
      }

      try {
        const res = await fetch("/api/rsvp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weddingId: rsvp.weddingId, ...request.response }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          reply(
            { ok: false, error: json.error ?? "Could not send your RSVP." },
            request.requestId
          );
          return;
        }

        const whatsappUrl = buildRsvpWhatsappUrl(rsvp.whatsappNumber, request.response);
        reply({ ok: true }, request.requestId);

        // The RSVP is safely stored before we hand the guest to WhatsApp. The
        // message is prefilled but not sent: the guest reviews and taps Send.
        if (whatsappUrl) {
          window.setTimeout(() => window.location.assign(whatsappUrl), 150);
        }
      } catch {
        reply(
          { ok: false, error: "Could not send your RSVP. Please try again." },
          request.requestId
        );
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function broadcast() {
    setReadyFor(html);
    try {
      frameRef.current?.contentWindow?.postMessage({ type: "invite-lime:data", payload }, "*");
    } catch {
      // Template sandboxes are allowed to ignore messages.
    }
  }

  return (
    <div className={className ?? "relative min-h-dvh w-full bg-ivory-950"}>
      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-ivory-950 text-ivory-200">
          <Icon name="refresh" size="lg" className="animate-spin" />
          <p className="font-body-sm">Opening invitation…</p>
        </div>
      )}
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={html}
        onLoad={broadcast}
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-orientation-lock allow-pointer-lock allow-presentation"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        referrerPolicy="no-referrer"
        className="h-dvh w-full border-0 bg-ivory-950"
      />
      {fallbackHref && (
        <noscript>
          <a href={fallbackHref} className="block p-4 text-center font-body-sm text-ivory-100 underline">
            {fallbackLabel ?? "Open invitation"}
          </a>
        </noscript>
      )}
    </div>
  );
}
