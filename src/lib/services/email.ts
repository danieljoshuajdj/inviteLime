import { createAdminClient } from "@/lib/supabase/admin";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateKey: string;
  weddingId?: string | null;
  userId?: string | null;
}

export interface EmailResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

function sendViaResend(payload: ResendPayload): Promise<EmailResult> {
  const apiKey = process.env.EMAIL_API_KEY;
  if (!apiKey || apiKey === "placeholder" || apiKey === "re_xxxxxxxx") {
    return Promise.resolve({
      ok: false,
      error: "EMAIL_API_KEY is not configured in the server environment.",
    });
  }

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const body = (await res.json()) as { id?: string; message?: string; error?: string };
      if (!res.ok) {
        return { ok: false, error: body.message || body.error || `HTTP ${res.status}` };
      }
      return { ok: true, providerMessageId: body.id };
    })
    .catch((err: unknown) => ({
      ok: false,
      error: err instanceof Error ? err.message : "Network error sending email",
    }));
}

/**
 * Sends a transactional email and records delivery state. Delivery is
 * idempotent per (templateKey, toEmail + optional weddingId) to prevent
 * duplicate emails from webhook retries.
 */
export async function sendEmail(input: SendEmailInput, opts: { dedupe?: boolean } = {}) {
  const supabase = createAdminClient();

  const from =
    process.env.EMAIL_FROM || `Invite Lime <invitations@${process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "")}>`;

  // Dedupe is checked *before* sending, not after. Sending first and only
  // suppressing the audit row would still deliver a duplicate email to the
  // customer on every webhook retry or repeat publish.
  if (opts.dedupe) {
    const { count } = await supabase
      .from("email_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("template_key", input.templateKey)
      .eq("to_email", input.to)
      .eq("status", "sent");

    // One successful delivery per key+recipient is enough. Failed attempts are
    // not counted, so a retry after a transient provider error still goes out.
    if ((count ?? 0) >= 1) {
      return { ok: true, skipped: true } satisfies EmailResult & { skipped: true };
    }
  }

  const result = await sendViaResend({
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  await supabase.from("email_deliveries").insert({
    to_email: input.to,
    subject: input.subject,
    template_key: input.templateKey,
    wedding_id: input.weddingId ?? null,
    user_id: input.userId ?? null,
    status: result.ok ? "sent" : "failed",
    provider_message_id: result.providerMessageId ?? null,
    error: result.ok ? null : result.error ?? null,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  return result;
}

export {
  renderInvitationPublishedEmail,
  renderPaymentConfirmedEmail,
  renderAccountAccessEmail,
  renderInvitationResendEmail,
} from "./email-templates";