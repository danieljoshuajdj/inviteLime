"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { cn, formatPrice } from "@/lib/utils";
import type { WeddingData } from "@/lib/builder/defaults";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  template: {
    id: string;
    name: string;
    slug: string;
    pricePaise: number;
    versionId: string;
  };
  /** Exact amount the server will charge, in integer minor units. */
  amountPaise: number;
  /** ISO-4217 currency of `amountPaise` (geo-detected server-side). */
  currency: string;
  data: WeddingData;
  email: string | null;
  loading?: boolean;
}

export function PaymentConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  template,
  amountPaise,
  currency,
  data,
  email,
  loading = false,
}: Props) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const coverTitle =
    data.brideName && data.groomName
      ? `${data.groomName.split(" ")[0]} & ${data.brideName.split(" ")[0]}`
      : "Your names here";

  const weddingDate = data.weddingDate
    ? new Date(`${data.weddingDate}T00:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const expirationDate = data.weddingDate
    ? new Date(new Date(`${data.weddingDate}T00:00:00`).setMonth(new Date(`${data.weddingDate}T00:00:00`).getMonth() + 2))
        .toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
    : "—";

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-sm",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div
        className={cn(
          "w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200",
          isVisible ? "translate-y-0" : "translate-y-4"
        )}
      >
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-secondary/5 blur-2xl pointer-events-none" />

        <div className="p-6 lg:p-8">
          <div className="flex items-center justify-between pb-4">
            <div className="flex items-center gap-2">
              <Icon name="lock_open" size="md" className="text-secondary" />
              <span className="font-body-xs font-bold uppercase tracking-widest text-secondary">
                Own Your Invitation Suite
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
              aria-label="Close"
            >
              <Icon name="close" size="md" />
            </button>
          </div>

          <h2 id="payment-modal-title" className="font-headline-lg font-semibold text-on-surface tracking-tight mb-2">
            Own Your Invitation Suite
          </h2>
          <p className="font-body-md text-on-surface-variant mb-6 leading-relaxed">
            You are purchasing the perpetual animated celebration suite for your wedding milestone.
            No upfront account registration or password required — your license is linked immediately to your email address.
          </p>

          <div className="mb-6 bg-surface-container-low rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2">
              <span className="font-body-md font-semibold text-on-surface">Suite Specification</span>
              <span className="font-body-xs font-bold px-2 py-0.5 bg-secondary-fixed text-on-secondary-fixed rounded">
                {template.name}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-body-xs uppercase tracking-wider text-on-surface-variant">Archival Template</p>
                <p className="font-body-md font-semibold text-on-surface">{template.name}</p>
              </div>
              <div>
                <p className="font-body-xs uppercase tracking-wider text-on-surface-variant">Honored Couple</p>
                <p className="font-body-md font-semibold text-on-surface">{coverTitle}</p>
              </div>
              <div>
                <p className="font-body-xs uppercase tracking-wider text-on-surface-variant">Ceremony Date</p>
                <p className="font-body-md font-semibold text-on-surface">{weddingDate}</p>
              </div>
              <div>
                <p className="font-body-xs uppercase tracking-wider text-on-surface-variant">Archival Window</p>
                <p className="font-body-md font-semibold text-on-surface flex items-center gap-1">
                  Active until {expirationDate}
                  <Icon name="info" size="sm" className="text-secondary" ariaLabel="Calculated: Wedding + 2 Full Months" />
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6 bg-surface-container-lowest p-3 rounded-lg flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
              <Icon name="mark_email_unread" size="md" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-body-xs uppercase tracking-wider text-on-surface font-semibold">Immediate Dispatch Recipient</p>
              <p className="font-body-sm text-secondary font-bold truncate">{email || "Not provided"}</p>
              <p className="font-body-xs text-on-surface-variant">
                Your passwordless magic link to edit & inspect RSVPs will be routed here upon confirmation.
              </p>
            </div>
          </div>

          <div className="mb-6 space-y-2">
            <span className="font-body-md font-bold uppercase tracking-wider text-on-surface">Investment Summary</span>
            <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
              <span>Bespoke Interactive Suite License</span>
              <span className="font-medium text-on-surface">{formatPrice(amountPaise, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
              <span>Taxes & payment processing</span>
              <span className="font-body-xs font-bold text-secondary uppercase">Included</span>
            </div>
            <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
              <span>Global CDN Hosting & WhatsApp RSVP Webhook Bridge</span>
              <span className="font-body-xs font-bold text-secondary uppercase">Complimentary</span>
            </div>

            <div className="mt-2 pt-2 bg-surface-container px-4 py-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-headline-sm font-bold text-on-surface">Total Payable</span>
                <p className="font-body-xs text-on-surface-variant">Inclusive of all federal taxes & Razorpay banking charges</p>
              </div>
              <div className="text-right">
                <span className="font-display-hero text-[34px] leading-tight text-on-surface font-bold">
                  {formatPrice(amountPaise, currency)}
                </span>
                <p className="font-body-xs text-secondary uppercase font-bold tracking-widest">{currency} Settlement</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button
              size="xl"
              fullWidth
              loading={loading}
              onClick={onConfirm}
              className="shadow-md group"
            >
              <Icon name="shield_lock" size="md" className="text-secondary-fixed" />
              Pay {formatPrice(amountPaise, currency)} via Razorpay
              <Icon name="arrow_forward" size="sm" className="group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              variant="outline"
              size="xl"
              fullWidth
              onClick={onClose}
            >
              Back to Edit
            </Button>
          </div>

          <div className="mt-6 pt-4 bg-surface-container-lowest flex flex-col md:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-on-surface-variant font-body-xs">
              <Icon name="encrypted" size="sm" className="text-secondary" />
              <span>Protected by Razorpay AES-256 Bit Payment Gateway</span>
            </div>
            <div className="flex items-center gap-3 text-on-surface-variant font-body-xs">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-secondary" /> Instant CDN Webhook</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-secondary" /> Zero-Password Onboarding</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="bg-surface-container-low p-3 rounded-lg flex items-center gap-2">
              <Icon name="bolt" size="md" className="text-secondary" />
              <div className="min-w-0">
                <p className="font-body-xs font-bold text-on-surface uppercase">Instant Domain</p>
                <p className="font-body-xs text-on-surface-variant truncate">Live at invite-lime.me/...</p>
              </div>
            </div>
            <div className="bg-surface-container-low p-3 rounded-lg flex items-center gap-2">
              <Icon name="history_edu" size="md" className="text-secondary" />
              <div className="min-w-0">
                <p className="font-body-xs font-bold text-on-surface uppercase">Archival Pledge</p>
                <p className="font-body-xs text-on-surface-variant truncate">Retained through {expirationDate}</p>
              </div>
            </div>
            <div className="bg-surface-container-low p-3 rounded-lg flex items-center gap-2">
              <Icon name="share" size="md" className="text-secondary" />
              <div className="min-w-0">
                <p className="font-body-xs font-bold text-on-surface uppercase">Export Package</p>
                <p className="font-body-xs text-on-surface-variant truncate">Print-ready PDF + Web</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}