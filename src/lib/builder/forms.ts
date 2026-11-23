/**
 * Event forms.
 *
 * A template belongs to exactly one event category, and that category decides
 * which form the builder shows and which fields the publish flow requires.
 * This module is deliberately dependency-free so it can be imported by client
 * components, server routes, tests and the generated database types alike.
 */

export type FormType = "wedding" | "engagement" | "birthday_celebration" | "birthday_wishes";

export const FORM_TYPES: readonly FormType[] = [
  "wedding",
  "engagement",
  "birthday_celebration",
  "birthday_wishes",
] as const;

export interface FormDefinition {
  type: FormType;
  /** The single admin-managed category that owns this form. */
  categorySlug: string;
  categoryName: string;
  /** Short noun used in UI copy, e.g. "Wedding". */
  label: string;
  /** Label for the event's main date field. Empty when the form has none. */
  dateLabel: string;
  /** Heading shown on the invitation cover in the built-in runtime. */
  invitationLabel: string;
}

export const FORM_DEFINITIONS: Record<FormType, FormDefinition> = {
  wedding: {
    type: "wedding",
    categorySlug: "wedding",
    categoryName: "Wedding",
    label: "Wedding",
    dateLabel: "Wedding date",
    invitationLabel: "Wedding Invitation",
  },
  engagement: {
    type: "engagement",
    categorySlug: "engagement",
    categoryName: "Engagement",
    label: "Engagement",
    dateLabel: "Engagement date",
    invitationLabel: "Engagement Invitation",
  },
  birthday_celebration: {
    type: "birthday_celebration",
    categorySlug: "birthday-celebration",
    categoryName: "Birthday Celebration",
    label: "Birthday Celebration",
    dateLabel: "Celebration date",
    invitationLabel: "Birthday Celebration",
  },
  birthday_wishes: {
    type: "birthday_wishes",
    categorySlug: "birthday-wishes",
    categoryName: "Birthday Wishes",
    label: "Birthday Wishes",
    dateLabel: "",
    invitationLabel: "Birthday Wishes",
  },
};

/** The fixed category taxonomy that ships with the event forms. */
export const EVENT_CATEGORIES = FORM_TYPES.map((type) => {
  const definition = FORM_DEFINITIONS[type];
  return {
    slug: definition.categorySlug,
    name: definition.categoryName,
    type,
  };
});

export function isFormType(value: unknown): value is FormType {
  return typeof value === "string" && (FORM_TYPES as readonly string[]).includes(value);
}

/** Reads a stored form type, falling back to the original wedding flow. */
export function formTypeOrDefault(value: unknown): FormType {
  return isFormType(value) ? value : "wedding";
}

export function formTypeFromCategorySlug(slug: unknown): FormType | null {
  if (typeof slug !== "string") return null;
  const match = EVENT_CATEGORIES.find((category) => category.slug === slug);
  return match?.type ?? null;
}

export function categorySlugForFormType(type: FormType): string {
  return FORM_DEFINITIONS[type].categorySlug;
}

export function formDefinition(type: FormType): FormDefinition {
  return FORM_DEFINITIONS[type];
}

export function isBirthdayForm(type: FormType): boolean {
  return type === "birthday_celebration" || type === "birthday_wishes";
}

/** Cards used by the birthday forms; they have no couple or ceremonies. */
export function hasEventDate(type: FormType): boolean {
  return type !== "birthday_wishes";
}

/**
 * 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th", 21 → "21st".
 * Non-integers and values below one are returned unchanged so callers cannot
 * accidentally render "NaNth".
 */
export function ordinal(value: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return String(value);
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export interface FormIdentity {
  formType?: FormType | string | null;
  brideName?: string | null;
  groomName?: string | null;
  celebrantName?: string | null;
}

/** The form stored on a draft/invitation, defaulting to the wedding form. */
export function formTypeOf(data: FormIdentity | null | undefined): FormType {
  return formTypeOrDefault(data?.formType);
}

/**
 * Primary display name. Weddings and engagements show the couple, birthday
 * forms show the person being celebrated.
 */
export function coverTitle(data: FormIdentity | null | undefined): string {
  const type = formTypeOf(data);
  if (isBirthdayForm(type)) {
    return data?.celebrantName?.trim() || "Name here";
  }
  const groom = firstName(data?.groomName);
  const bride = firstName(data?.brideName);
  if (groom && bride) return `${groom} & ${bride}`;
  return groom || bride || "Your names here";
}

/** First word of a name, used where space is tight (nav, invoice rows). */
export function firstName(value: string | null | undefined): string {
  return (value ?? "").trim().split(/\s+/)[0] ?? "";
}

export function formSubtitle(data: FormIdentity & { birthdayNumber?: number | null }): string | null {
  const type = formTypeOf(data);
  if (type === "birthday_wishes") {
    return typeof data.birthdayNumber === "number" ? `${ordinal(data.birthdayNumber)} Birthday` : "Birthday Wishes";
  }
  return null;
}
