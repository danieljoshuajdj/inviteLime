import type { AdminClient } from "@/lib/supabase/admin";

/**
 * RSVP write path.
 *
 * All writes go through the `submit_rsvp` SQL function rather than a table
 * upsert. The uniqueness guarantee for "one response per wedding + email" is a
 * partial unique index, and PostgREST's `on_conflict` cannot target a partial
 * index, so a direct `.upsert()` fails with SQLSTATE 42P10. The function owns
 * the idempotency instead and re-checks invitation state, which matters because
 * it is executable by anon and can be called without going through the route.
 */

/** Trims and lower-cases an address so lookups are case-insensitive. */
export function normalizeRsvpEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  return trimmed === "" ? null : trimmed.toLowerCase();
}

export interface SubmitRsvpInput {
  weddingId: string;
  name: string;
  email: string | null | undefined;
  phone?: string | null;
  attendance: "attending" | "declining" | "pending";
  guests: number;
  dietary?: string | null;
  message?: string | null;
}

export class RsvpSubmissionError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "RsvpSubmissionError";
    this.code = code;
  }
}

/**
 * Records a guest response, replacing any earlier response from the same
 * address. Throws {@link RsvpSubmissionError} when the invitation refuses the
 * write (closed, expired, or rejected input).
 */
export async function submitRsvpResponse(
  client: AdminClient,
  input: SubmitRsvpInput
): Promise<void> {
  const { error } = await client.rpc("submit_rsvp", {
    p_wedding_id: input.weddingId,
    p_name: input.name.trim(),
    p_email: normalizeRsvpEmail(input.email),
    p_phone: typeof input.phone === "string" && input.phone.trim() ? input.phone.trim() : null,
    p_attendance: input.attendance,
    p_guests: input.guests,
    p_dietary: input.dietary ?? null,
    p_message: input.message ?? null,
  });

  if (error) throw new RsvpSubmissionError(error.message, error.code ?? null);
}
