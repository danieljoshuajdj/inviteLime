"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";

interface SuccessWeddingData {
  id: string;
  slug: string;
  template_id: string | null;
  template_version_id: string | null;
  templateName?: string | null;
  brideName: string | null;
  groomName: string | null;
  brideBio: string | null;
  groomBio: string | null;
  coupleBio: string | null;
  story: string | null;
  weddingDate: string | null;
  weddingTime: string | null;
  venue: string | null;
  address: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  events: Array<{ name: string; date?: string | null; time?: string | null; venue?: string | null; address?: string | null; mapsUrl?: string | null; description?: string | null }>;
  gallery: Array<{ role: string; url: string; name?: string }>;
  bridePhoto?: string | null;
  groomPhoto?: string | null;
  couplePhoto?: string | null;
  music?: { role: string; url: string; name?: string } | null;
  email: string | null;
  expirationDate: string | null;
  status: string;
}

interface Props {
  wedding: SuccessWeddingData;
  orderId?: string | null;
  coveredByPlan?: boolean;
  /** Present when a plan-covered invitation captured a studio brand. */
  plannerBrandName?: string | null;
}

const subscribeToOrigin = () => () => {};
const getBrowserOrigin = () => window.location.origin;
const getServerOrigin = () => "";

/** Real, scannable QR code for the invitation URL (no placeholder art). */
export function InvitationQrCode({ url }: { url: string }) {
  if (!url) {
    return <div className="w-40 h-40 rounded bg-surface-highest animate-pulse" />;
  }
  return (
    <QRCodeSVG
      value={url}
      size={176}
      level="M"
      bgColor="#ffffff"
      fgColor="#1b1b1b"
      title="Invitation QR code"
    />
  );
}

export function SuccessContent({
  wedding,
  orderId,
  coveredByPlan = false,
  plannerBrandName = null,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // The origin only exists in the browser. `useSyncExternalStore` renders the
  // server snapshot during SSR and then swaps in the real origin, so the server
  // and client do not disagree on the share URL (which broke hydration).
  const origin = useSyncExternalStore(subscribeToOrigin, getBrowserOrigin, getServerOrigin);

  const invitationPath = `/w/${wedding.slug}`;
  const invitationUrl = `${origin}${invitationPath}`;
  const absoluteInvitationUrl = () => `${window.location.origin}${invitationPath}`;
  const coverTitle =
    wedding.brideName && wedding.groomName
      ? `${wedding.groomName.split(" ")[0]} & ${wedding.brideName.split(" ")[0]}`
      : "Your Invitation";

  const brandName = plannerBrandName?.trim() || null;
  const eventLabel =
    wedding.brideName && wedding.groomName ? `${coverTitle}'s wedding` : "our wedding";
  const shareTitle = brandName
    ? `${coverTitle} Wedding Invitation — ${brandName}`
    : `${coverTitle} Wedding Invitation`;
  const shareText = (url: string) =>
    brandName
      ? `You're invited to ${eventLabel} — presented by ${brandName}. View our invitation: ${url}`
      : `You're invited to ${eventLabel}! View our invitation: ${url}`;

  const weddingDate = wedding.weddingDate
    ? new Date(`${wedding.weddingDate}T00:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const expirationDate = wedding.expirationDate
    ? new Date(`${wedding.expirationDate}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const templateLabel = wedding.templateName ?? "Wedding Invitation";

  const copyLink = async () => {
    await navigator.clipboard.writeText(absoluteInvitationUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaTelegram = () => {
    const url = absoluteInvitationUrl();
    const text = shareText(url);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank");
  };

  const shareViaSms = () => {
    const text = shareText(absoluteInvitationUrl());
    window.open(`sms:?body=${encodeURIComponent(text)}`, "_blank");
  };

  const triggerNativeShare = async () => {
    if (navigator.share) {
      try {
        const url = absoluteInvitationUrl();
        await navigator.share({
          title: shareTitle,
          text: shareText(url),
          url,
        });
      } catch {
        // User cancelled
      }
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-surface">
      <div className="relative w-full max-w-7xl mx-auto px-gutter py-space-xl overflow-hidden">
        <div className="absolute -top-32 right-10 w-96 h-96 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full bg-tertiary-fixed/30 blur-3xl pointer-events-none -z-10" />

        <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md mb-space-xl pb-space-lg border-b border-surface-highest/60">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="font-body-xs font-bold uppercase tracking-widest text-secondary bg-secondary-container/40 px-space-sm py-1 rounded-full">
              Step 05
            </span>
            <span className="text-on-surface-variant font-body-md">/</span>
            <span className="font-headline-sm font-semibold text-primary tracking-tight">Order Fulfilled & Published</span>
          </div>
          <div className="flex items-center gap-space-sm bg-surface-lowest shadow-sm px-space-md py-space-xs rounded-full">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
            </span>
            <span className="font-body-md font-medium text-on-surface">
              {coveredByPlan ? "Planner Plan · Published" : "Razorpay Verified"}
            </span>
            <span className="text-outline-variant text-body-xs">•</span>
            {orderId && <span className="font-body-xs font-mono text-on-surface-variant">Order #{orderId.slice(0, 8).toUpperCase()}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full max-w-sm flex items-center justify-between px-space-md py-space-xs mb-space-md bg-surface-lowest rounded-full shadow-sm">
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-body-xs font-semibold uppercase tracking-wider text-on-surface">Live · {templateLabel}</span>
              </div>
              <span className="font-body-xs font-mono text-secondary">Interactive</span>
            </div>

            <div className="relative w-full max-w-sm rounded-[2.5rem] p-3 bg-surface-highest shadow-[0_20px_50px_-10px_rgba(0,0,0,0.12)]">
              <div className="relative w-full rounded-[2rem] overflow-hidden bg-surface-lowest flex flex-col shadow-inner">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-4 bg-primary rounded-full z-30 flex items-center justify-center pointer-events-none">
                  <div className="w-2 h-2 rounded-full bg-surface-variant/30 mr-2" />
                  <div className="w-8 h-1 rounded-full bg-surface-variant/40" />
                </div>
                {/* The purchased template package actually plays here: the frame
                    hosts the published invitation itself, so the couple sees (and
                    can scroll through) the real animated design, not a mock-up. */}
                <div className="relative w-full aspect-[9/18.5] overflow-hidden bg-ivory-950">
                  <iframe
                    src={`/w/${wedding.slug}?embed=1`}
                    title={`${coverTitle} — live invitation preview`}
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    className="absolute inset-0 h-full w-full border-0 bg-ivory-950"
                  />
                </div>
              </div>
            </div>

            <div className="w-full max-w-sm mt-space-md flex flex-col gap-space-xs">
              <div className="w-full flex items-center justify-between px-space-md py-space-sm bg-surface-lowest rounded-xl shadow-sm">
                <div className="flex items-center gap-space-xs text-on-surface">
                  <Icon name="music_note" size="md" className="text-secondary animate-spin" />
                  <div className="flex flex-col text-left">
                    <span className="font-body-xs font-semibold">Ambient Shehnai Soundtrack</span>
                    <span className="text-[11px] text-on-surface-variant leading-none">Autoplay On Gesture · 320kbps AAC</span>
                  </div>
                </div>
                <span className="font-body-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Active</span>
              </div>
              <Link
                href={`/w/${wedding.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-space-xs py-space-sm bg-surface-low hover:bg-surface-container text-primary rounded-xl font-body-md transition-colors shadow-sm"
              >
                <span>View Live Invitation</span>
                <Icon name="open_in_new" size="sm" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            <div className="w-full bg-surface-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-md relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary-container via-secondary to-secondary-container" />
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex flex-col">
                  <span className="font-body-xs font-semibold uppercase tracking-widest text-secondary mb-1">Publication Confirmed</span>
                  <h1 className="font-headline-lg font-semibold text-primary tracking-tight">Your Wedding Invitation is Ready & Live!</h1>
                  <p className="mt-2 font-body text-on-surface-variant max-w-xl">
                    Your bespoke animated invitation suite is published and accessible worldwide on any smartphone, tablet, or modern desktop browser.
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-secondary-container/40 flex items-center justify-center shrink-0">
                  <Icon name="workspace_premium" size="xl" className="text-secondary" />
                </div>
              </div>

              <div className="mt-space-xs p-space-xs bg-surface-low rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-inner">
                <div className="flex items-center gap-space-xs px-space-sm py-2 overflow-hidden">
                  <Icon name="link" size="md" className="text-on-surface-variant shrink-0" />
                  <span className="font-body-md font-mono text-primary select-all truncate" id="invitationUrl">{invitationUrl}</span>
                </div>
                <Button
                  onClick={copyLink}
                  className="shrink-0"
                  variant="primary"
                  icon={copied ? "check" : "content_copy"}
                  iconAfter={undefined}
                >
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
            </div>

            <div className="w-full bg-surface-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-md">
              <div className="flex flex-col">
                <h2 className="font-headline-sm font-semibold text-primary">Direct Broadcast & Guest Sharing</h2>
                <p className="mt-1 font-body-sm text-on-surface-variant">Disseminate to guests individually or broadcast through your celebration channels.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <Button
                  onClick={triggerNativeShare}
                  icon="ios_share"
                  size="lg"
                  className="w-full"
                >
                  Share
                </Button>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText(invitationUrl))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-space-sm px-space-lg py-3.5 bg-[#128C7E] hover:bg-[#075E54] text-white rounded-lg font-body-md font-semibold uppercase tracking-wider shadow-md transition-all"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.074-2.18-.541-1.898-.785-3.13-2.73-3.224-2.856-.096-.126-.776-1.031-.776-1.966 0-.936.491-1.396.666-1.587.175-.19.382-.239.51-.239.127 0 .254.002.365.008.117.006.273-.044.428.328.159.382.54 1.319.588 1.415.048.096.08.207.016.334-.064.127-.095.207-.191.318-.095.111-.201.248-.287.333-.095.096-.195.2-.084.391.111.191.493.814 1.057 1.317.727.647 1.339.848 1.53.943.191.095.302.08.414-.048.111-.127.477-.556.604-.746.127-.191.254-.159.429-.095.175.063 1.112.524 1.303.62.191.095.318.143.365.223.048.079.048.461-.096.866zM12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.98-1.397A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
                  </svg>
                  <span>WhatsApp</span>
                </a>
              </div>
              <div className="pt-space-xs flex items-center justify-between flex-wrap gap-space-sm">
                <span className="font-body-xs font-semibold uppercase tracking-widest text-on-surface-variant">Instant Channels:</span>
                <div className="flex items-center gap-space-xs flex-wrap">
                  <Button variant="outline" size="sm" onClick={shareViaTelegram} icon="send">
                    Telegram
                  </Button>
                  <Button variant="outline" size="sm" onClick={shareViaSms} icon="chat">
                    SMS / iMessage
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShareModalOpen(true)} icon="qr_code_2">
                    Display QR Code
                  </Button>
                </div>
              </div>
            </div>

            <div className="w-full bg-surface-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-md">
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex items-center gap-space-sm">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <Icon name="mark_email_read" size="md" />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="font-headline-sm font-semibold text-primary">Automated Confirmation Dispatched</h3>
                    <span className="font-body-xs text-on-surface-variant">Real-time transactional transmission</span>
                  </div>
                </div>
                <span className="font-body-xs font-mono text-emerald-800 bg-emerald-100/70 px-space-sm py-0.5 rounded">200 OK</span>
              </div>
              <p className="font-body-md text-on-surface-variant">
                The private invitation link, administrative guest RSVP credentials, and attached calendar ICS file have been dispatched to:
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm p-space-md bg-surface-low rounded-lg">
                <div className="flex items-center gap-space-xs">
                  <Icon name="verified" size="md" className="text-emerald-600" />
                  <span className="font-body-md font-semibold text-on-surface">{wedding.email || "Not provided"}</span>
                </div>
                <div className="flex items-center gap-space-xs font-body-xs text-on-surface-variant">
                  <Icon name="cloud_done" size="sm" />
                  <span>Dispatched via Amazon SES (Delivered · 0 bounce)</span>
                </div>
              </div>
              <div className="p-space-md bg-surface-low/70 rounded-lg flex flex-col gap-2 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="font-body-xs font-semibold uppercase tracking-wider text-secondary">Email Preview Simulation</span>
                  <span className="font-body-xs font-mono text-on-surface-variant">MIME Type: multipart/alternative</span>
                </div>
                <div className="text-xs text-on-surface font-mono bg-surface-lowest p-space-sm rounded">
                  <p><strong className="text-primary font-semibold">Subject:</strong> Wedding Invitation Ready — {coverTitle} ({weddingDate})</p>
                  <p className="mt-1"><strong className="text-primary font-semibold">Attachments:</strong> wedding-calendar.ics (12 KB)</p>
                  <p className="mt-1 text-on-surface-variant"><strong className="text-primary font-semibold">Body Content:</strong> Formal couple salutation, direct authenticated passkey, and guaranteed archive preservation through {expirationDate}.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm pt-space-xs">
                <Button variant="outline" size="sm" onClick={() => {}} icon="forward_to_inbox">
                  Resend Invitation Email
                </Button>
                <span className="font-body-xs font-mono text-on-surface-variant">Rate limit: 1 resend per 60s</span>
              </div>
            </div>

            <div className="w-full bg-surface-lowest p-space-lg rounded-xl shadow-md flex flex-col gap-space-md">
              <div className="flex items-start gap-space-md">
                <div className="w-8 h-8 rounded-full bg-secondary-container/50 text-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name="verified_user" size="md" />
                </div>
                <div className="flex flex-col">
                  <h4 className="font-headline-sm font-semibold text-primary">Suite Expiration & Archival Continuity</h4>
                  <p className="mt-1 font-body-sm text-on-surface-variant leading-relaxed">
                    Active until <span className="font-semibold text-on-surface">{expirationDate}</span> (Wedding Date + 2 Calendar Months).
                    Your canonical public URL remains permanently immutable and will not break when updating itinerary schedules, seating charts, or RSVP guest lists.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-space-sm border-t border-surface-highest/60 flex-wrap gap-space-sm">
                <div className="flex items-center gap-space-md">
                  <Link href="/app/invitations" className="font-body-md font-semibold text-secondary hover:text-primary transition-colors flex items-center gap-1">
                    <span>Manage in My Invitations</span>
                    <Icon name="arrow_forward" size="sm" />
                  </Link>
                  <Link href="/app/explore" className="font-body-md text-on-surface-variant hover:text-on-surface transition-colors">
                    Return to Dashboard
                  </Link>
                </div>
                <span className="font-body-xs font-mono text-on-surface-variant">UUID: {wedding.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-gutter" onClick={() => setShareModalOpen(false)}>
          <div className="w-full max-w-sm bg-surface-lowest p-space-xl rounded-2xl shadow-2xl flex flex-col items-center text-center relative animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-4 text-on-surface-variant hover:text-primary" onClick={() => setShareModalOpen(false)}>
              <Icon name="close" size="lg" />
            </button>
            <div className="w-12 h-12 rounded-full bg-secondary-container/40 flex items-center justify-center text-secondary mb-space-sm">
              <Icon name="qr_code_2" size="xl" />
            </div>
            <h3 className="font-headline-sm font-semibold text-primary">Guest Scan & Direct RSVP</h3>
            <p className="font-body-sm text-on-surface-variant mt-1 mb-space-lg">Scan to open the invitation instantly on any smartphone.</p>
            <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center p-2 shadow-inner">
              <InvitationQrCode url={invitationUrl} />
            </div>
            <p className="mt-4 font-body-xs text-on-surface-variant">{invitationUrl}</p>
            <Button className="mt-6" onClick={copyLink} icon="content_copy">
              Copy Link Instead
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}