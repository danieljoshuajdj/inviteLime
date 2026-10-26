import { createAdminClient } from "@/lib/supabase/admin";
import { recordCount } from "@/lib/services/analytics";
import { jsonError, readBody } from "@/lib/services/helpers";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";
import { rsvpSchema } from "@/lib/validators";
import { RsvpSubmissionError, submitRsvpResponse } from "@/lib/services/rsvp";

export const dynamic = "force-dynamic";

/**
 * Public RSVP submission. The guest does not log in; ownership is implied by
 * knowing the wedding. Writes go through submit_rsvp(), which is idempotent per
 * wedding + email.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const parsed = rsvpSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Invalid RSVP", parsed.error.flatten());

    const limit = await consumeRateLimit({
      bucket: "rsvp",
      key: clientKey(req),
      limit: 20,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many RSVP attempts from this device. Please try again later.");
    }

    const supabase = createAdminClient();

    const { data: wedding, error: weddingError } = await supabase
      .from("weddings")
      .select("id, slug, status, rsvp_toggle, rsvp_deadline, wedding_data")
      .eq("id", parsed.data.weddingId)
      .maybeSingle();
    if (weddingError) return jsonError(500, "Could not read invitation");
    if (!wedding || wedding.status !== "active") return jsonError(404, "Invitation not found");
    if (!wedding.rsvp_toggle) return jsonError(403, "RSVPs are closed");

    if (wedding.rsvp_deadline && new Date(wedding.rsvp_deadline) < new Date()) {
      return jsonError(403, "RSVP deadline has passed");
    }

    try {
      await submitRsvpResponse(supabase, {
        weddingId: parsed.data.weddingId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        attendance: parsed.data.attendance,
        guests: parsed.data.guests,
        dietary: parsed.data.dietary,
        message: parsed.data.message,
      });
    } catch (err) {
      // The function re-checks the same invitation rules, so a refusal here is a
      // state change between the two reads rather than a bug.
      if (err instanceof RsvpSubmissionError) {
        return jsonError(err.code === "22023" ? 400 : 409, err.message);
      }
      throw err;
    }

    void recordCount("rsvp_submitted", 1, { wedding_id: parsed.data.weddingId });

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not submit RSVP");
  }
}