import { publishWedding, invitationUrl, type PublishedInvitation } from "./weddings";
import { sendEmail, renderInvitationPublishedEmail } from "./email";
import { recordEvent } from "./analytics";
import { linkInvitationToCustomer } from "./account-linking";
import { formDefinition, formTypeOrDefault, isBirthdayForm } from "@/lib/builder/forms";

/**
 * The step that turns a paid draft into a live invitation.
 *
 * Everything that must happen once a wedding is genuinely paid for lives here —
 * publish (which also relocates the guest-scoped media into the wedding folder),
 * analytics, post-purchase account linking, the couple's "your link is live"
 * email, and the internal new-order notice. Both the Razorpay verify endpoint
 * and the server-to-server webhook already needed to run exactly this sequence,
 * so it lives in one place rather than being duplicated per payment path.
 *
 * Emails are fire-and-forget (`void ... .catch`) on purpose: a paid couple must
 * get their invitation even if the email provider is down, and the invitation
 * page itself is the source of truth. The email is a convenience, not the
 * receipt of record.
 */
export async function finalizePaidWedding(input: {
  weddingId: string;
  /** Already-reconciled product price, used only in the internal notice. */
  pricePaise: number;
  currency: string;
  /** Distinguishes the browser verify path from the webhook path in logs. */
  source: "verify" | "webhook" | "dev" | "planner_plan";
}): Promise<{ published: PublishedInvitation; coupleEmail: { to: string; subject: string; html: string } | null }> {
  const published = await publishWedding(input.weddingId);

  void recordEvent("wedding_published", { wedding_id: input.weddingId });

  // Post-purchase account linking: attaches the invitation to the buyer's
  // account (creating a passwordless customer account when needed) and emails
  // the account access link. A failure here never invalidates the purchase.
  void linkInvitationToCustomer(input.weddingId).then((linked) => {
    if (!linked.linked) {
      console.warn("[finalize] account linking skipped", {
        weddingId: input.weddingId,
        reason: linked.reason,
      });
    }
  });

  // Notify the couple with their live link (deduped per recipient).
  let coupleEmail: { to: string; subject: string; html: string } | null = null;
  if (published.email) {
    const formType = formTypeOrDefault(published.form_type);
    const definition = formDefinition(formType);
    const birthday = isBirthdayForm(formType);
    const subjectName = birthday
      ? published.celebrant_name?.trim() || "Birthday Star"
      : [published.groom_name, published.bride_name].filter(Boolean).join(" & ") || "Your invitation";
    const rendered = renderInvitationPublishedEmail({
      coupleNames: subjectName,
      weddingDate: published.wedding_date ?? "",
      invitationLabel: definition.invitationLabel,
      dateLabel: definition.dateLabel || undefined,
      invitationUrl: invitationUrl(published.slug),
      expirationDate: published.expiration_date ?? "",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000/app/explore",
    });
    coupleEmail = { to: published.email, subject: rendered.subject, html: rendered.html };
    void sendEmail(
      { to: published.email, ...rendered, templateKey: "invitation_published", weddingId: input.weddingId },
      { dedupe: true }
    ).catch(() => {});
  }

  // A plan-covered publish is not a new one-time order, so the finance notice
  // is intentionally suppressed. The planner usage counter is the record.
  if (input.source !== "planner_plan") {
    void sendEmail({
      to: process.env.EMAIL_FROM || "orders@invite-lime.example",
      subject: `[Invite Lime] New order ${input.weddingId} — ${input.pricePaise / 100} ${input.currency}`,
      html: `<p>Invitation ${input.weddingId} published (${input.source}): <a href="${invitationUrl(published.slug)}">${invitationUrl(published.slug)}</a></p>`,
      templateKey: "notify_admin_order",
      weddingId: input.weddingId,
    }).catch(() => {});
  }

  return { published, coupleEmail };
}
