import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/services/email";
import { renderAccountAccessEmail } from "@/lib/services/email-templates";

export interface LinkInvitationResult {
  linked: boolean;
  userId: string | null;
  emailSent: boolean;
  reason?: string;
}

interface WeddingForLinking {
  id: string;
  user_id: string | null;
  email: string | null;
  slug: string | null;
  form_type: string | null;
  bride_name: string | null;
  groom_name: string | null;
  celebrant_name: string | null;
}

/** Human name for account copy: the couple, or the birthday person. */
function displayName(wedding: WeddingForLinking): string {
  if (wedding.form_type === "birthday_celebration" || wedding.form_type === "birthday_wishes") {
    return wedding.celebrant_name?.trim() || "Birthday Star";
  }
  return [wedding.groom_name, wedding.bride_name].filter(Boolean).join(" & ") || "Your invitation";
}

/**
 * Post-purchase account linking.
 *
 * If the checkout email already belongs to a customer we simply attach the new
 * invitation to that account. Otherwise we create a passwordless account with
 * Supabase's admin API and email the activation (magic) link through the
 * platform email service — the customer is never forced to invent a password
 * during checkout.
 *
 * Never throws: a linking/email failure must not invalidate a paid invitation.
 */
export async function linkInvitationToCustomer(weddingId: string): Promise<LinkInvitationResult> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("weddings")
      .select("id, user_id, email, slug, form_type, bride_name, groom_name, celebrant_name")
      .eq("id", weddingId)
      .maybeSingle();

    const wedding = (data ?? null) as WeddingForLinking | null;

    if (error || !wedding) return { linked: false, userId: null, emailSent: false, reason: "wedding-not-found" };
    if (!wedding.email) return { linked: false, userId: null, emailSent: false, reason: "no-email" };
    if (wedding.user_id) return { linked: true, userId: wedding.user_id, emailSent: false, reason: "already-linked" };

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    const redirectTo = `${appUrl}/auth/callback?next=/app/explore`;

    let userId: string | null = null;
    let actionLink: string | null = null;

    // 1. Existing account → magic link for a fresh session.
    const magic = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: wedding.email,
      options: { redirectTo },
    });
    if (!magic.error && magic.data?.user) {
      userId = magic.data.user.id;
      actionLink = magic.data.properties?.action_link ?? null;
    } else {
      // 2. New customer → passwordless account activation.
      const created = await supabase.auth.admin.generateLink({
        type: "signup",
        email: wedding.email,
        password: `vc_${crypto.randomUUID()}!A1`,
        options: {
          redirectTo,
          data: {
            full_name: displayName(wedding),
            source: "guest_checkout",
          },
        },
      });
      if (created.error || !created.data?.user) {
        return {
          linked: false,
          userId: null,
          emailSent: false,
          reason: created.error?.message ?? "account-creation-failed",
        };
      }
      userId = created.data.user.id;
      actionLink = created.data.properties?.action_link ?? null;
    }

    if (userId) {
      // Ownership is set server-side only; never sourced from the browser.
      await supabase.from("weddings").update({ user_id: userId }).eq("id", weddingId);
    }

    let emailSent = false;
    if (actionLink) {
      const email = renderAccountAccessEmail({
        coupleNames: displayName(wedding),
        invitationUrl: wedding.slug ? `${appUrl}/w/${wedding.slug}` : appUrl,
        accessUrl: actionLink,
        appUrl,
      });
      const result = await sendEmail(
        {
          to: wedding.email,
          ...email,
          templateKey: "account_access",
          weddingId,
          userId,
        },
        { dedupe: true }
      );
      emailSent = result.ok;
    }

    return { linked: Boolean(userId), userId, emailSent };
  } catch (err) {
    // Structured server-side logging without leaking credentials.
    console.error("[account-linking] failed", {
      weddingId,
      message: err instanceof Error ? err.message : "unknown error",
    });
    return { linked: false, userId: null, emailSent: false, reason: "exception" };
  }
}
