import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { formatCurrency } from "@/lib/services/currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats an integer minor-unit amount (paise/cents) in the given currency.
 * Delegates to the currency module so each currency is formatted with its own
 * home-market locale (₹1,499 / $19 / €18).
 */
export function formatPrice(amountPaise: number, currency = "INR"): string {
  return formatCurrency(amountPaise, currency);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0900-\u097F]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function uniqueSlugWithSuffix(input: string, suffix?: string): string {
  const base = slugify(input) || "invitation";
  const year = new Date().getFullYear();
  return suffix ? `${base}-${suffix}-${year}` : `${base}-${year}`;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

export function expirationFromWeddingDate(weddingDate: Date): Date {
  return addMonths(weddingDate, 2);
}

/**
 * The local calendar date as `YYYY-MM-DD` — the value an `<input type="date">`
 * reads and writes. Built from local parts (not `toISOString`) so a wedding
 * does not shift a day in the user's timezone.
 */
export function toDateInputValue(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local wall-clock time as `HH:MM` — the value an `<input type="time">` reads and writes. */
export function toTimeInputValue(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Whether a local `YYYY-MM-DD` date (with an optional `HH:MM` time) is already
 * in the past. `min` on a date input only covers the picker, so typed or
 * pre-filled values still need this check before a form is submitted.
 */
export function isPastMoment(date: string, time: string | null | undefined, now: Date = new Date()): boolean {
  if (!date) return false;
  const today = toDateInputValue(now);
  if (date < today) return true;
  if (date > today || !time) return false;
  return time < toTimeInputValue(now);
}

/**
 * A date/time `min` bound that never invalidates the value already in the field.
 *
 * Published invitations can legitimately hold a past date (the wedding happened
 * and the owner is fixing a typo), and a browser refuses to submit a form whose
 * date input sits below its `min`. Existing values stay untouched; every new
 * selection is held to `bound`.
 */
export function minSelectable(bound: string | null | undefined, current: string | null | undefined): string | undefined {
  if (!bound) return undefined;
  return current && current < bound ? undefined : bound;
}