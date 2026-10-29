"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";

import { Button } from "@/components/shared/Button";
import { TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { cn, formatPrice } from "@/lib/utils";
import type { WeddingData } from "@/lib/builder/defaults";
import { coverTitle, formDefinition, formTypeOf, isBirthdayForm, ordinal } from "@/lib/builder/forms";
import { validateDetails } from "@/lib/builder/validation";
import { PaymentConfirmationModal } from "@/components/builder/PaymentConfirmationModal";

interface Props {
  token: string;
  data: WeddingData;
  email: string | null;
  onEmailChange: (email: string | null) => void;
  template: {
    id: string;
    name: string;
    slug: string;
    pricePaise: number;
    /** ISO-4217 currency carried through from the server-resolved quote. */
    currency: string;
    versionId: string;
  };
  onBack: () => void;
  /**
   * Flushes the current draft. A plan-covered publish must not race autosave.
   * Returns false when the save failed so checkout can stop safely.
   */
  onSaved: () => boolean | void | Promise<boolean | void>;
  /** Present only for planner-owned drafts; absent for couples and demos. */
  planner?: {
    active: boolean;
    canCreate: boolean;
    planName: string | null;
    remaining: number | null;
    limit: number | null;
    brandName: string | null;
    brandComplete: boolean;
    reason: string;
  } | null;
  /** Dev-only: reveals the "publish without paying" shortcut. */
  devBypassEnabled?: boolean;
}

type PayState = "idle" | "creating" | "verifying" | "done";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

interface VerifiedResult {
  url?: string;
  wedding_id?: string;
  error?: string;
}

interface DevPublishResult {
  url?: string;
  emailSentTo?: string | null;
  emailPreview?: { subject: string } | null;
  error?: string;
}

export function StepReview({
  token,
  data,
  email,
  onEmailChange,
  template,
  onBack,
  onSaved,
  planner,
  devBypassEnabled,
}: Props) {
  const router = useRouter();
  const [payState, setPayState] = useState<PayState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [orderData, setOrderData] = useState<{ orderId: string; amountPaise: number; currency: string; weddingId: string } | null>(null);
  const [devState, setDevState] = useState<"idle" | "publishing" | "done">("idle");
  const [devResult, setDevResult] = useState<DevPublishResult | null>(null);

  const formType = formTypeOf(data);
  const birthday = isBirthdayForm(formType);
  const definition = formDefinition(formType);
  const invitationTitle = coverTitle(data);
  // Mirrors the server's eligibility check. A planner without a live plan, a
  // free slot or complete brand details buys a normal one-time invitation.
  const plannerPlanCovers = Boolean(
    planner?.active && planner.canCreate && planner.brandComplete
  );

  const beginCheckout = useCallback(async () => {
    const issue = validateDetails(data, formType);
    if (issue) {
      setError(issue.message);
      return;
    }
    const emailError = planner ? null : publishEmailError(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError(null);
    setPayState("creating");
    const saved = await onSaved();
    if (saved === false) {
      setError("Could not save your latest changes. Check your connection and try again.");
      setPayState("idle");
      return;
    }

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          templateId: template.id,
          templateVersionId: template.versionId,
          ...(birthday
            ? { celebrantName: data.celebrantName }
            : { brideName: data.brideName, groomName: data.groomName }),
          ...(formType === "birthday_wishes" ? {} : { weddingDate: data.weddingDate }),
          email: email?.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        orderId?: string;
        amountPaise?: number;
        currency?: string;
        wedding?: { id: string };
        url?: string;
        coveredByPlan?: boolean;
        error?: string;
      };
      if (!res.ok || !json.orderId) throw new Error(json.error ?? "Could not create the order");

      // A plan-covered publish has already gone live on the server. There is no
      // Razorpay modal, so go straight to the success page.
      if (json.coveredByPlan) {
        setPayState("done");
        router.push(`/create/success?wedding=${json.wedding?.id ?? ""}&order=${json.orderId}`);
        return;
      }

      setOrderData({
        orderId: json.orderId,
        amountPaise: json.amountPaise ?? 0,
        // Server-resolved currency; never the hardcoded home-market one.
        currency: json.currency ?? template.currency,
        weddingId: json.wedding?.id ?? "",
      });
      setPayState("idle");
      setShowPaymentModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create order. Try again.");
      setPayState("idle");
    }
  }, [token, template.id, template.versionId, template.currency, data, formType, birthday, email, onSaved, planner, router]);

  const handlePaymentConfirm = useCallback(() => {
    if (!orderData || !window.Razorpay) {
      setError("Payment widgets are still loading. Please retry.");
      return;
    }

    setPayState("verifying");
    setShowPaymentModal(false);

    new window.Razorpay({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
      amount: orderData.amountPaise,
      currency: orderData.currency,
      name: "Invite Lime Atelier",
      description: `${template.name} · ${definition.label.toLowerCase()} invitation license`,
      order_id: orderData.orderId,
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setPayState("verifying");
        try {
          const verifyRes = await fetch("/api/payments/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wedding_id: orderData.weddingId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const v: VerifiedResult = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(v.error ?? "Payment could not be verified.");

          router.push(`/create/success?wedding=${orderData.weddingId}&order=${orderData.orderId}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Payment verification failed");
          setPayState("idle");
        }
      },
      modal: {
        ondismiss: () => setPayState("idle"),
        confirm_close: true,
      },
      theme: { color: "#000000" },
      prefill: { email: email ?? undefined },
    }).open();
  }, [orderData, template.name, email, router, definition.label]);

  const handlePaymentCancel = useCallback(() => {
    setShowPaymentModal(false);
    setPayState("idle");
  }, []);

  // Dev-only shortcut: publish this draft as if it had been paid for, so the
  // share URL and the invitation email can be checked without a real charge.
  // The server still enforces the DEV_BYPASS_PAYMENT flag, so this button
  // simply disappears once the flag is off.
  const devPublish = useCallback(async () => {
    const issue = validateDetails(data, formType);
    if (issue) {
      setError(issue.message);
      return;
    }
    const emailError = planner ? null : publishEmailError(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError(null);
    setDevState("publishing");
    setDevResult(null);
    // Flush pending autosave first, otherwise the server publishes a stale draft.
    const saved = await onSaved();
    if (saved === false) {
      setError("Could not save your latest changes. Check your connection and try again.");
      setDevState("idle");
      return;
    }

    try {
      const res = await fetch("/api/dev/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as DevPublishResult;
      if (!res.ok) throw new Error(json.error ?? "Dev publish failed");
      setDevResult(json);
      setDevState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev publish failed. Try again.");
      setDevState("idle");
    }
  }, [token, data, formType, email, onSaved, planner]);

  return (
    <section aria-labelledby="step-review-title">
      <RazorpayScript />
      <PaymentConfirmationModal
        isOpen={showPaymentModal}
        onClose={handlePaymentCancel}
        onConfirm={handlePaymentConfirm}
        template={template}
        amountPaise={orderData?.amountPaise ?? template.pricePaise}
        currency={orderData?.currency ?? template.currency}
        data={data}
        email={email}
        loading={payState === "verifying"}
      />
      <div className="mx-auto max-w-4xl">
        <p className="flex items-center gap-2 font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          <Icon name="rocket_launch" size="sm" /> Step 3 · Preview & Publish
        </p>
        <h1 id="step-review-title" className="mt-2 font-heading-2xl !text-on-surface">
          Does this feel like you?
        </h1>
        <p className="mt-2 font-body text-on-surface-variant">
          {plannerPlanCovers
            ? "Publish this invitation under your studio brand. It stays live even if your plan changes later."
            : planner
              ? "This invitation will publish as a standard one-time purchase, without studio branding. It stays live even if your plan changes later."
              : "Spin up a personal link and pay once to publish. Everything stays yours."}
        </p>

        {planner && (
          <div className="mt-5 rounded-xl border border-secondary/20 bg-secondary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-body-sm font-semibold text-on-surface">
                <Icon name="workspace_premium" size="sm" className="text-secondary" />
                {plannerPlanCovers
                  ? "Covered by your Planner Plan"
                  : planner.active && !planner.brandComplete
                    ? "Add brand details to use your plan"
                    : planner.active && !planner.canCreate
                      ? "Planner Plan limit reached"
                      : "Planner Plan needs attention"}
              </p>
              {plannerPlanCovers && planner.remaining !== null && (
                <span className="font-body-xs text-on-surface-variant">
                  {planner.remaining} invitation{planner.remaining === 1 ? "" : "s"} left
                </span>
              )}
            </div>
            <p className="mt-1 font-body-xs text-on-surface-variant">
              {plannerPlanCovers
                ? `${planner.planName ?? "Planner Plan"} · ${planner.brandName ?? "Add your brand details"}`
                : planner.active && !planner.brandComplete
                  ? "Add your studio name and phone to publish under your brand, or continue with a one-time purchase below."
                  : planner.active && !planner.canCreate
                    ? "Your plan's invitation limit is reached. Renew or upgrade to publish under your brand, or continue with a one-time purchase below."
                    : "Your plan is not active. Renew it in Planner plan to publish under your brand, or continue with a one-time purchase below. Already-live invitations are not affected."}
            </p>
            {planner.active && !planner.brandComplete && (
              <a
                href="/app/account/brand"
                className="mt-3 inline-flex items-center gap-1 font-body-sm font-semibold text-secondary underline"
              >
                Add brand details <Icon name="arrow_forward" size="sm" />
              </a>
            )}
          </div>
        )}

        <PreviewBoard data={data} invitationTitle={invitationTitle} />

        <div className="mt-8 rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-body-xs uppercase tracking-widest text-on-surface-variant">
                {plannerPlanCovers ? "Planner Plan" : "One-time license"}
              </p>
              <p className="mt-1 font-heading-2xl !text-on-surface">
                {plannerPlanCovers ? "Included" : formatPrice(template.pricePaise, template.currency)}
              </p>
              <p className="mt-0.5 font-body-xs text-on-surface-variant">
                {plannerPlanCovers
                  ? "no checkout · branded with your studio details"
                  : planner
                    ? "one-time purchase · no studio branding · 13-month hosting"
                    : "including taxes · 13-month hosting · reserved link"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-end">
              <p className="flex items-center gap-1.5 font-body-xs font-medium text-on-surface-variant">
                <Icon name="check_circle" size="sm" className="text-success" /> Free preview, pay only at publish
              </p>
              {/* <p className="flex items-center gap-1.5 font-body-xs font-medium text-on-surface-variant">
                <Icon name="check_circle" size="sm" className="text-success" /> Deposit refundable within 14 days
              </p> */}
            </div>
          </div>

          <div className="mt-5 border-t border-outline-variant pt-5">
            <TextInput
              label="Email for your receipt & live link"
              hint={
                planner
                  ? "We never spam. This is where you'll get your invoice and shareable URL."
                  : "Required to publish. We'll send your invoice and shareable URL here."
              }
              type="email"
              value={email ?? ""}
              onChange={(e) => onEmailChange(e.target.value || null)}
              icon="mail"
              placeholder="you@example.com"
              required={!planner}
            />
          </div>

          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
              <Icon name="error" size="sm" /> {error}
            </p>
          )}

          <div className="mt-6">
            <Button
              size="xl"
              fullWidth
              icon="lock"
              loading={payState === "creating" || payState === "verifying"}
              onClick={beginCheckout}
            >
              {payState === "creating"
                ? "Preparing…"
                : payState === "verifying"
                  ? "Confirming payment…"
                  : plannerPlanCovers
                    ? "Publish with Planner Plan"
                    : "Pay & publish"}
            </Button>
          </div>

          {devBypassEnabled && (
            <div className="mt-4 rounded-xl border border-dashed border-warning/50 bg-warning/5 p-4">
              <p className="flex items-center gap-2 font-body-xs font-semibold uppercase tracking-widest text-warning">
                <Icon name="settings" size="sm" /> Dev only · no payment
              </p>
              <p className="mt-1 font-body-xs text-on-surface-variant">
                Publishes this draft through the real publish path without charging, so you can check
                the share URL and the invitation email.
              </p>

              <div className="mt-3">
                <Button
                  size="lg"
                  fullWidth
                  variant="outline"
                  icon="rocket_launch"
                  loading={devState === "publishing"}
                  onClick={devPublish}
                >
                  {devState === "publishing" ? "Publishing…" : "Publish"}
                </Button>
              </div>

              {devResult?.url && (
                <div className="mt-3 rounded-lg bg-surface p-3">
                  <p className="font-body-xs uppercase tracking-widest text-on-surface-variant">Share URL</p>
                  <a
                    href={devResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body-sm font-medium break-all text-primary underline"
                  >
                    {devResult.url}
                  </a>
                  <p className="mt-2 font-body-xs text-on-surface-variant">
                    {devResult.emailSentTo
                      ? devResult.emailPreview?.subject
                        ? `Email queued to ${devResult.emailSentTo} · "${devResult.emailPreview.subject}"`
                        : `Email queued to ${devResult.emailSentTo}`
                      : "No email on this draft — add one above to test the email flow."}
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="mt-4 text-center font-body-xs text-on-surface-variant">
            By publishing you agree to our <a href="/terms" className="underline">Terms</a> and{" "}
            <a href="/privacy" className="underline">Privacy Policy</a>. Payments secured by Razorpay.
          </p>
        </div>

        <div className="mt-6">
          <Button
            variant="ghost"
            size="lg"
            icon="arrow_back"
            iconAfter={undefined}
            onClick={onBack}
            className="rounded-xl border border-black"
          >
            Back to Edit
          </Button>
        </div>
      </div>
    </section>
  );
}

function RazorpayScript() {
  return <Script id="razorpay-checkout" src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />;
}

function PreviewBoard({ data, invitationTitle }: { data: WeddingData; invitationTitle: string }) {
  const formType = formTypeOf(data);
  const birthday = isBirthdayForm(formType);
  const definition = formDefinition(formType);
  const wishes = formType === "birthday_wishes";

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="overflow-hidden rounded-3xl border border-gold-500/40 bg-ivory-950 text-ivory-50 shadow-xl">
        <div className="relative flex aspect-[4/5] flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="h-px w-24 bg-gold-400" />
          <p className="font-body-xs uppercase tracking-[0.45em] text-gold-300">
            {definition.invitationLabel}
          </p>
          <h2 className="font-heading-2xl !font-display !text-ivory-50">{invitationTitle}</h2>
          {wishes && typeof data.birthdayNumber === "number" && (
            <p className="font-body-sm uppercase tracking-[0.3em] text-gold-300">
              {ordinal(data.birthdayNumber)} Birthday
            </p>
          )}
          <div className="flex flex-col gap-1 text-ivory-300">
            {data.weddingDate && (
              <p className="flex items-center justify-center gap-2 font-body-sm">
                <Icon name="calendar_month" size="sm" /> {formatDateLong(data.weddingDate)}
              </p>
            )}
            {data.venue && (
              <p className="flex items-center justify-center gap-2 font-body-sm">
                <Icon name="location_on" size="sm" /> {data.venue}
              </p>
            )}
          </div>
          <span className="mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-gold-400 text-ivory-950">
            <Icon name="play_circle" size="lg" weight="w500" />
          </span>
          <span className="h-px w-24 bg-gold-400" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-outline-variant bg-surface p-5">
          <h3 className="font-heading-md font-semibold !text-on-surface">Your invitation</h3>
          <dl className="mt-3 space-y-2.5 font-body-sm">
            {birthday ? (
              <>
                <Row label="Birthday person" value={data.celebrantName || "—"} />
                <Row
                  label="Birthday"
                  value={
                    typeof data.birthdayNumber === "number"
                      ? ordinal(data.birthdayNumber)
                      : "—"
                  }
                />
                {!wishes && (
                  <Row
                    label={definition.dateLabel}
                    value={data.weddingDate ? formatDateLong(data.weddingDate) : "—"}
                  />
                )}
                {!wishes && <Row label="Venue" value={data.venue || "—"} />}
                <Row label="Gallery" value={`${data.gallery.length} photo${data.gallery.length === 1 ? "" : "s"}`} />
                <Row label="Main image" value={data.mainPhoto ? "Selected" : "None yet"} />
              </>
            ) : (
              <>
                <Row label="Groom" value={data.groomName || "—"} />
                <Row label="Bride" value={data.brideName || "—"} />
                <Row label="Ceremony cards" value={`${data.events.length}`} />
                <Row label="Gallery" value={`${data.gallery.length} photo${data.gallery.length === 1 ? "" : "s"}`} />
                <Row label="Soundtrack" value={data.music ? "Selected" : "None yet"} />
              </>
            )}
          </dl>
        </div>

        {wishes && data.specialMessage.trim() && (
          <div className="rounded-2xl border border-outline-variant bg-surface p-5">
            <h3 className="font-heading-md font-semibold !text-on-surface">Special message</h3>
            <p className="mt-3 whitespace-pre-line font-body-sm text-on-surface-variant">
              {data.specialMessage}
            </p>
          </div>
        )}

        {!birthday && data.events.length > 0 && (
          <div className="rounded-2xl border border-outline-variant bg-surface p-5">
            <h3 className="font-heading-md font-semibold !text-on-surface">Ceremonies</h3>
            <ul className="mt-3 space-y-2.5">
              {data.events.map((ev, i) => (
                <li key={i} className="flex items-start gap-2.5 font-body-sm">
                  <Icon name="celebration" size="sm" className="mt-0.5 text-secondary" />
                  <span>
                    <strong className="font-semibold !text-on-surface">{ev.name || `Event ${i + 1}`}</strong>
                    {ev.date && <span className="text-on-surface-variant"> · {formatDateLong(ev.date)}</span>}
                    {ev.venue && <span className="text-on-surface-variant"> · {ev.venue}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-on-surface-variant">{label}</dt>
      <dd className={cn("text-end font-medium !text-on-surface", !value || value === "—" ? "font-normal text-on-surface-variant" : "")}>{value}</dd>
    </div>
  );
}

function publishEmailError(email: string | null): string | null {
  const value = (email ?? "").trim();
  if (!value) return "Please enter your email address to publish.";
  // The server re-validates with zod; this catches the common typo before a
  // checkout attempt and keeps the field's own error slot empty.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Please enter a valid email address to publish.";
  }
  return null;
}

function formatDateLong(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}