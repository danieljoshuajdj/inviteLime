import type { WeddingData } from "./defaults";
import { formDefinition, isBirthdayForm, type FormType } from "./forms";

/**
 * Form-aware validation shared by the builder, the account editor and the
 * server publish routes. Keeping one rule set here means a field can never be
 * required in the UI but optional at checkout (or the reverse).
 */

export interface FormValidationIssue {
  message: string;
  /** Builder section that should be brought into view. */
  sectionId: string;
}

export const BIRTHDAY_NUMBER_MIN = 1;
export const BIRTHDAY_NUMBER_MAX = 150;

export function isValidBirthdayNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= BIRTHDAY_NUMBER_MIN &&
    value <= BIRTHDAY_NUMBER_MAX
  );
}

export function isPastEventMoment(
  date: string,
  time: string | null | undefined,
  now: Date
): boolean {
  if (!date) return false;
  const moment = new Date(`${date}T${time || "23:59"}:00`);
  if (Number.isNaN(moment.getTime())) return false;
  return moment.getTime() < now.getTime();
}

/**
 * Returns the first blocking problem, or null when the form can advance.
 * `now` is supplied by the caller (client clock in the builder) — never
 * captured at module scope, which would freeze the boundary at boot.
 */
export function validateDetails(
  data: WeddingData,
  formType: FormType,
  now?: Date | null
): FormValidationIssue | null {
  if (isBirthdayForm(formType)) {
    if (!data.celebrantName.trim()) {
      return {
        message: "Please enter the birthday person's name before continuing.",
        sectionId: "celebrant-details",
      };
    }
  } else if (!data.brideName.trim() || !data.groomName.trim()) {
    return {
      message: "Please enter both bride and groom names before continuing.",
      sectionId: "couple-details",
    };
  }

  if (formType === "birthday_wishes") {
    if (!isValidBirthdayNumber(data.birthdayNumber)) {
      return {
        message: `Enter a birthday number between ${BIRTHDAY_NUMBER_MIN} and ${BIRTHDAY_NUMBER_MAX}.`,
        sectionId: "celebrant-details",
      };
    }
    if (!data.specialMessage.trim()) {
      return {
        message: "Please write a special message before continuing.",
        sectionId: "celebrant-details",
      };
    }
    if (data.gallery.length > 3) {
      return {
        message: "Choose at most three gallery photos for a birthday wish.",
        sectionId: "photos",
      };
    }
    return null;
  }

  if (!data.weddingDate || !data.venue.trim()) {
    return {
      message: `${formDefinition(formType).dateLabel} and venue are required.`,
      sectionId: "when-and-where",
    };
  }

  if (now) {
    if (isPastEventMoment(data.weddingDate, data.weddingTime, now)) {
      const noun =
        formType === "birthday_celebration"
          ? "celebration"
          : formDefinition(formType).label.toLowerCase();
      return {
        message: `Your ${noun} date has already passed — please pick today or a later date and time.`,
        sectionId: "when-and-where",
      };
    }

    if (!isBirthdayForm(formType)) {
      const staleEvent = data.events.find(
        (event) => event.date && isPastEventMoment(event.date, event.time, now)
      );
      if (staleEvent) {
        return {
          message: `“${staleEvent.name || "An additional ceremony"}” has a date in the past — please update it.`,
          sectionId: "when-and-where",
        };
      }
    }
  }

  return null;
}

/**
 * Whether the step's required content is present. Past dates are intentionally
 * excluded: a saved invitation to a date that has since passed is still a
 * complete form, and the stepper must not un-tick it.
 */
export function detailsComplete(data: WeddingData, formType: FormType): boolean {
  if (!data.celebrantName.trim() && isBirthdayForm(formType)) return false;
  if (formType === "birthday_wishes") {
    return (
      Boolean(data.celebrantName.trim()) &&
      isValidBirthdayNumber(data.birthdayNumber) &&
      Boolean(data.specialMessage.trim())
    );
  }
  if (isBirthdayForm(formType)) {
    return Boolean(data.celebrantName.trim() && data.weddingDate && data.venue.trim());
  }
  return Boolean(
    data.brideName.trim() &&
      data.groomName.trim() &&
      data.weddingDate &&
      data.venue.trim()
  );
}
