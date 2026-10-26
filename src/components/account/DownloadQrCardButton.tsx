"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { toast } from "@/components/account/toast";
import { Button } from "@/components/shared/Button";

interface Props {
  url: string;
  couple: string;
  date: string;
  venue: string;
  slug: string;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const INK = "#174A35";
const LIME = "#A4D65E";
const IVORY = "#FBF8F1";
const MUTED = "#5B6B60";
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = "Arial, Helvetica, sans-serif";

function scanLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/**
 * Composes a printable 1080×1350 (4:5) PNG with the couple's details and a
 * scannable QR code. The QR is drawn by `qrcode.react` into an off-screen
 * canvas, then composited here — no third-party image service involved.
 */
function buildQrCard(
  qr: HTMLCanvasElement,
  { couple, date, venue, url }: Omit<Props, "slug">
) {
  const card = document.createElement("canvas");
  card.width = CARD_WIDTH;
  card.height = CARD_HEIGHT;
  const ctx = card.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  const center = CARD_WIDTH / 2;

  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, CARD_WIDTH - 80, CARD_HEIGHT - 80);

  ctx.fillStyle = LIME;
  ctx.fillRect(40, 40, CARD_WIDTH - 80, 10);

  ctx.textAlign = "center";

  ctx.fillStyle = INK;
  ctx.font = `700 30px ${SANS}`;
  ctx.fillText("INVITE LIME", center, 132);

  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText("YOU'RE INVITED", center, 188);

  // Names may be long; step the size down until they fit in two lines.
  let nameSize = 84;
  let nameLines: string[] = [];
  do {
    ctx.font = `700 ${nameSize}px ${SERIF}`;
    nameLines = scanLines(ctx, couple, CARD_WIDTH - 240);
    if (nameLines.length <= 2) break;
    nameSize -= 6;
  } while (nameSize > 48);
  ctx.font = `700 ${nameSize}px ${SERIF}`;

  ctx.fillStyle = INK;
  const lineHeight = Math.round(nameSize * 1.12);
  nameLines.forEach((line, i) => ctx.fillText(line, center, 290 + i * lineHeight));

  const dividerY = 285 + nameLines.length * lineHeight + 22;
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(center - 40, dividerY);
  ctx.lineTo(center + 40, dividerY);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `500 34px ${SANS}`;
  ctx.fillText(fitLine(ctx, date, CARD_WIDTH - 240), center, dividerY + 58);

  if (venue.trim()) {
    ctx.fillStyle = MUTED;
    ctx.font = `400 28px ${SANS}`;
    const venueLines = scanLines(ctx, venue, CARD_WIDTH - 260).slice(0, 2);
    venueLines.forEach((line, i) =>
      ctx.fillText(fitLine(ctx, line, CARD_WIDTH - 260), center, dividerY + 108 + i * 40)
    );
  }

  const qrBoxSize = 520;
  const qrBoxY = Math.max(
    690,
    285 + nameLines.length * lineHeight + 22 + (venue.trim() ? 190 : 100)
  );

  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(23, 74, 53, 0.18)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, center - qrBoxSize / 2, qrBoxY, qrBoxSize, qrBoxSize, 24);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = "rgba(23, 74, 53, 0.18)";
  ctx.lineWidth = 2;
  roundedRect(ctx, center - qrBoxSize / 2, qrBoxY, qrBoxSize, qrBoxSize, 24);
  ctx.stroke();

  // The white QR module margin is already part of the rendered canvas.
  ctx.drawImage(qr, center - 230, qrBoxY + 30, 460, 460);

  ctx.fillStyle = INK;
  ctx.font = `600 24px ${SANS}`;
  ctx.fillText("Scan to open the invitation", center, qrBoxY + 570);

  ctx.fillStyle = MUTED;
  ctx.font = `400 21px ${SANS}`;
  ctx.fillText(fitLine(ctx, url.replace(/^https?:\/\//, ""), CARD_WIDTH - 200), center, qrBoxY + 606);

  return card;
}

/** Download QR card action for a published invitation. */
export function DownloadQrCardButton(props: Props) {
  const { url, slug } = props;
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);

  function download() {
    const qr = qrRef.current;
    if (!qr || !url) {
      toast("QR code is not ready yet", "Try again in a moment.");
      return;
    }

    setDownloading(true);
    try {
      const card = buildQrCard(qr, props);
      const link = document.createElement("a");
      const safeSlug = slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "invitation";
      link.href = card.toDataURL("image/png");
      link.download = `${safeSlug}-qr-card.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast("QR card downloaded", "Print it on your invitation cards.");
    } catch {
      toast("Could not download the QR card", "Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon="qr_code_2"
        loading={downloading}
        onClick={download}
      >
        Download QR card
      </Button>
      {/* Rendered off-screen so the QR bitmap is ready before the click. */}
      <QRCodeCanvas
        ref={qrRef}
        value={url}
        size={640}
        level="M"
        marginSize={2}
        bgColor="#ffffff"
        fgColor={INK}
        className="hidden"
        aria-hidden
      />
    </>
  );
}
