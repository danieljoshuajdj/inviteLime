import { normalizeWeddingData } from "@/lib/builder/defaults";
import { formTypeOrDefault, isBirthdayForm, type FormType } from "@/lib/builder/forms";
import { weddingDataToRuntimeInput } from "@/lib/services/demo-wedding";
import { signMediaToken } from "@/lib/services/media-sign";
import { rewriteRuntimeMedia, signDraftMediaUrl } from "@/lib/services/media-urls";
import {
  buildRuntimePayload,
  type RuntimePayload,
} from "@/lib/runtime/payload";

export interface GuestPreviewContext {
  draftId: string;
  templateSlug: string;
  token: string;
  appUrl: string;
  /** The template's event form; authoritative over the draft's stored value. */
  formType?: FormType;
  /** Present only when the draft's live plan would cover this publish. */
  planner?: {
    brandName: string;
    contactPhone: string;
    address: string | null;
    mapsUrl: string | null;
  } | null;
}

/**
 * Builds the exact runtime payload a guest's un-published preview will receive.
 * The preview runs the same runtime as the published invitation but is never
 * persisted and never exposed beyond the creator's session.
 *
 * Draft media is stored as an app-relative path, which cannot be loaded from
 * inside the sandboxed template frame, so every media URL is rewritten to an
 * absolute one carrying a short-lived signature. That signature — scoped to this
 * guest's own draft folder and to one object — is what authorizes the read, in
 * place of the session cookie the frame is structurally unable to send.
 */
export function buildGuestPreviewPayload(
  context: GuestPreviewContext,
  data: unknown
): RuntimePayload {
  const normalized = normalizeWeddingData({
    ...((data ?? {}) as Record<string, unknown>),
    formType: formTypeOrDefault(context.formType),
  });
  const birthday = isBirthdayForm(normalized.formType);
  const wedding = weddingDataToRuntimeInput(
    { id: context.draftId, slug: context.templateSlug },
    normalized
  );
  return buildRuntimePayload({
    mode: "live",
    assetsBaseUrl: context.appUrl,
    invitationUrl: `${context.appUrl}/create/${context.token}`,
    expiresAt: null,
    planner: context.planner ?? null,
    wedding: rewriteRuntimeMedia(wedding, (url) =>
      signDraftMediaUrl(url, {
        appUrl: context.appUrl,
        guestToken: context.token,
        sign: signMediaToken,
      })
    ),
    rsvp: {
      // Birthday forms have no RSVP flow, matching the published runtime.
      enabled: !birthday && normalized.rsvpEnabled,
      preview: true,
      deadline: null,
      attendingCount: 0,
      responseCount: 0,
      whatsappNumber: normalized.rsvpWhatsapp,
    },
  });
}