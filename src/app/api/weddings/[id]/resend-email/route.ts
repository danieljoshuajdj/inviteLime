import { createServerClient } from "@/lib/supabase/server";
import { jsonError, requireUser } from "@/lib/services/helpers";
import { sendEmail, renderInvitationResendEmail } from "@/lib/services/email";
import { invitationUrl } from "@/lib/services/weddings";
import { consumeRateLimit } from "@/lib/services/ops";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Resends the live invitation link to the owner's email address.
 * Ownership is verified server-side against the authenticated session and the
 * request is rate-limited (3 resends per hour per customer).
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();

  try {
    const session = await requireUser(supabase);

    const limit = await consumeRateLimit({
      bucket: "email_resend",
      key: session.user.id,
      limit: 3,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "You have already resent this invitation a few times. Please try again later.");
    }

    const { data: wedding, error } = await supabase
      .from("weddings")
      .select("id, user_id, slug, status, bride_name, groom_name, wedding_date, expiration_date, email")
      .eq("id", id)
      .maybeSingle();

    if (error) return jsonError(500, "Could not read the invitation");
    if (!wedding || wedding.user_id !== session.user.id) return jsonError(404, "Invitation not found");
    if (wedding.status !== "active" || !wedding.slug) {
      return jsonError(409, "Publish the invitation before resending its link");
    }

    const to = wedding.email ?? session.user.email;
    if (!to) return jsonError(400, "No email address is on file for this invitation");

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    const result = await sendEmail({
      to,
      ...renderInvitationResendEmail({
        coupleNames: `${wedding.groom_name ?? "—"} & ${wedding.bride_name ?? "—"}`,
        weddingDate: wedding.wedding_date ? formatDate(wedding.wedding_date) : "To be announced",
        invitationUrl: invitationUrl(wedding.slug),
        expirationDate: wedding.expiration_date ? formatDate(wedding.expiration_date) : "—",
        appUrl: `${appUrl}/app/explore`,
      }),
      templateKey: "invitation_resend",
      weddingId: wedding.id,
      userId: session.user.id,
    });

    if (!result.ok) {
      return jsonError(502, result.error ?? "The email provider rejected the message. Please try again.");
    }

    return Response.json({ ok: true, sentTo: to });
  } catch (err) {
    if (err instanceof Error && err.message === "AUTH_REQUIRED") {
      return jsonError(401, "Sign in required");
    }
    return jsonError(500, "Could not resend the invitation email");
  }
}
