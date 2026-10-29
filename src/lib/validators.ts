import { z } from "zod";

import { hasPhoneDigits } from "./phone";

export const emailSchema = z.string().email("Enter a valid email address");

export const coupleDetailsSchema = z.object({
  brideName: z.string().trim().min(1, "Bride name is required").max(120),
  groomName: z.string().trim().min(1, "Groom name is required").max(120),
  brideBio: z.string().trim().max(2000).optional().default(""),
  groomBio: z.string().trim().max(2000).optional().default(""),
  coupleStory: z.string().trim().max(4000).optional().default(""),
});

export const eventSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Event name is required").max(120),
  date: z.string().optional().nullable(),
  time: z.string().optional().nullable(),
  venue: z.string().trim().max(200).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  mapsUrl: z.string().url().optional().nullable().or(z.literal("")),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const weddingDetailsSchema = z.object({
  weddingDate: z.string().min(1, "Wedding date is required"),
  weddingTime: z.string().optional().nullable(),
  venue: z.string().trim().min(1, "Venue is required").max(200),
  address: z.string().trim().max(1000).optional().default(""),
  mapsUrl: z.string().url().optional().nullable().or(z.literal("")),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  coupleBio: z.string().trim().max(2000).optional().default(""),
  story: z.string().trim().max(4000).optional().default(""),
  events: z.array(eventSchema).max(12).default([]),
});

export const mediaItemSchema = z.object({
  role: z.enum(["bride", "groom", "couple", "gallery", "music", "video"]).optional(),
  url: z.string().trim().min(1, "Media URL is required").max(2000),
  name: z.string().trim().max(200).optional(),
});

/**
 * Kept loose enough for autosave: the builder writes on every colour-picker
 * move and can briefly hold a half-typed colour name. Runtime mapping only
 * forwards validated six-digit hex values to a template.
 */
export const dressSideSchema = z.object({
  color: z.string().trim().max(40).optional().nullable(),
  colorName: z.string().trim().max(80).optional().nullable(),
});

export const dressCodeSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    bride: dressSideSchema.optional().nullable(),
    groom: dressSideSchema.optional().nullable(),
  })
  .nullable()
  .optional();

export const weddingDataSchema = z.object({
  formType: z
    .enum(["wedding", "engagement", "birthday_celebration", "birthday_wishes"])
    .optional(),
  celebrantName: z.string().trim().max(120).optional().default(""),
  birthdayNumber: z.number().int().min(1).max(150).nullable().optional(),
  specialMessage: z.string().trim().max(4000).optional().default(""),
  mainPhoto: z.string().trim().max(2000).optional().nullable(),
  brideName: z.string().trim().min(1, "Bride name is required").max(120),
  groomName: z.string().trim().min(1, "Groom name is required").max(120),
  brideBio: z.string().trim().max(2000).optional().default(""),
  groomBio: z.string().trim().max(2000).optional().default(""),
  coupleBio: z.string().trim().max(2000).optional().default(""),
  story: z.string().trim().max(4000).optional().default(""),
  brideDesignation: z.string().trim().max(200).optional().default(""),
  groomDesignation: z.string().trim().max(200).optional().default(""),
  weddingDate: z.string().min(1, "Wedding date is required"),
  weddingTime: z.string().optional().nullable(),
  venue: z.string().trim().min(1, "Venue is required").max(200),
  address: z.string().trim().max(1000).optional().default(""),
  mapsUrl: z.string().url().optional().nullable().or(z.literal("")),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  events: z.array(eventSchema).max(12).default([]),
  gallery: z.array(mediaItemSchema).max(100).default([]),
  dress: dressCodeSchema,
  rsvpEnabled: z.boolean().optional().default(false),
  rsvpWhatsapp: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === "" || hasPhoneDigits(value), {
      message: "Enter a valid WhatsApp number, including the country code.",
    })
    .optional()
    .default(""),
  bridePhoto: z.string().trim().max(2000).optional().nullable(),
  groomPhoto: z.string().trim().max(2000).optional().nullable(),
  couplePhoto: z.string().trim().max(2000).optional().nullable(),
  music: mediaItemSchema.optional().nullable(),
});

/**
 * Shape of a *draft* — deliberately looser than `weddingDataSchema`.
 *
 * The builder autosaves after every step and every pause in typing, so a draft
 * is incomplete by definition: a ceremony card can exist before it is named, a
 * maps link can be half-typed ("https://maps.app.goo.gl/"). Demanding values or
 * URL formats here made autosave — and the "Continue" that waits on it — fail
 * for perfectly valid work in progress.
 *
 * Drafts therefore validate *shape and size* only. Publishing still goes
 * through the strict `weddingDataSchema`.
 */
const draftEventSchema = eventSchema.partial().extend({
  name: z.string().trim().max(120).optional(),
  mapsUrl: z.string().trim().max(2000).optional().nullable(),
});

const draftMediaItemSchema = mediaItemSchema.partial().extend({
  url: z.string().trim().max(2000).optional(),
});

export const weddingDraftSchema = weddingDataSchema.partial().extend({
  brideName: z.string().trim().max(120).optional(),
  groomName: z.string().trim().max(120).optional(),
  weddingDate: z.string().max(40).optional(),
  venue: z.string().trim().max(200).optional(),
  mapsUrl: z.string().trim().max(2000).optional().nullable(),
  // Autosave can capture a half-typed phone number; full validation happens at
  // publish/account save. A blank value is valid and means "no handoff yet".
  rsvpWhatsapp: z.string().trim().max(30).optional(),
  events: z.array(draftEventSchema).max(12).optional(),
  gallery: z.array(draftMediaItemSchema).max(100).optional(),
  music: draftMediaItemSchema.optional().nullable(),
});

export const rsvpSchema = z.object({
  weddingId: z.string().uuid(),
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().email("Enter a valid email").optional().nullable().or(z.literal("").transform(() => null)),
  // New templates require this on a Yes RSVP. The API keeps it optional so
  // already-published template versions that predate the field keep working.
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    }, "Enter a valid phone number")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  attendance: z.enum(["attending", "declining"]),
  guests: z.coerce.number().int().min(1).max(10).default(1),
  dietary: z.string().trim().max(300).optional().nullable(),
  message: z.string().trim().max(1000).optional().nullable(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(5).max(4000),
});

export const imageUploadSchema = z.object({
  role: z.enum(["bride", "groom", "couple", "gallery", "music", "video"]),
  weddingId: z.string().uuid().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

/** Platform routes that can never be used as an invitation slug. */
export const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "app",
  "auth",
  "w",
  "create",
  "templates",
  "live-demos",
  "how-it-works",
  "pricing",
  "features",
  "about",
  "contact",
  "faq",
  "privacy",
  "terms",
  "login",
  "register",
  "logout",
  "forgot-password",
  "dashboard",
  "settings",
  "account",
  "favorites",
  "invitations",
  "explore",
  "static",
  "assets",
  "public",
  "www",
  "support",
  "help",
  "_next",
]);

export function isReservedSlug(value: string): boolean {
  return RESERVED_SLUGS.has(value.trim().toLowerCase());
}

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format")
  .refine((value) => !isReservedSlug(value), "This slug is reserved by the platform");