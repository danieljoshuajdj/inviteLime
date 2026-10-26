import type { WeddingData } from "@/lib/builder/defaults";

export interface StepDef {
  id: string;
  label: string;
  /**
   * Whether this step's own requirements are satisfied.
   *
   * Deliberately separate from "have I been here": a step the user skipped past
   * without filling in is not complete, and the stepper must not tick it.
   */
  complete: boolean;
}

export function buildStepper(data: WeddingData): StepDef[] {
  return [
    // Couple, schedule, guest options and media share one form step. Only the
    // required details gate its tick — guest settings and media are optional.
    { id: "details", label: "Invitation details", complete: detailsComplete(data) },
    // Preview and Publish have no required content — arriving on them is the
    // completion signal, so only the caller's "advanced past it" check gates them.
    { id: "preview", label: "Preview", complete: true },
    { id: "review", label: "Preview & Publish", complete: true },
  ];
}

export function detailsComplete(data: WeddingData): boolean {
  return coupleComplete(data) && weddingComplete(data);
}

export function coupleComplete(data: WeddingData): boolean {
  return Boolean(data.brideName.trim() && data.groomName.trim());
}

export function weddingComplete(data: WeddingData): boolean {
  return Boolean(data.weddingDate && data.venue.trim());
}

export function mediaComplete(data: WeddingData): boolean {
  return Boolean(
    data.gallery.length || data.bridePhoto || data.groomPhoto || data.couplePhoto || data.music
  );
}
