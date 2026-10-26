interface InvitationEmailData {
  coupleNames: string;
  weddingDate: string;
  invitationUrl: string;
  expirationDate: string;
  appUrl: string;
}

export function renderInvitationPublishedEmail(data: InvitationEmailData) {
  const subject = `Wedding Invitation Ready — ${data.coupleNames}`;
  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#fef9f2;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef9f2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e2db;">
        <tr>
          <td style="height:6px;background:linear-gradient(90deg,#fed488,#775a19,#e9c176);"></td>
        </tr>
        <tr><td style="padding:36px 32px;">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#775a19;font-weight:700;margin-bottom:12px;">Invite Lime Atelier</div>
          <h1 style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:500;color:#1d1c18;font-size:26px;">Your Wedding Invitation is Ready &amp; Live</h1>
          <p style="margin:0 0 24px 0;color:#45464c;font-size:15px;line-height:1.6;">
            Congratulations, <strong>${data.coupleNames}</strong>! Your personalized invitation website has been
            published and is now visible to every guest you share it with.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f3ec;border-radius:10px;">
            <tr><td style="padding:20px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#76777d;margin-bottom:6px;">Wedding Date</div>
              <div style="font-size:16px;color:#1d1c18;font-weight:600;">${data.weddingDate}</div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#76777d;margin:16px 0 6px;">Active Until</div>
              <div style="font-size:16px;color:#1d1c18;font-weight:600;">${data.expirationDate}</div>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr><td align="center">
              <a href="${data.invitationUrl}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;">View Invitation</a>
            </td></tr>
          </table>

          <p style="margin:28px 0 0 0;color:#76777d;font-size:13px;line-height:1.6;">Your invitation link (keep it private):</p>
          <code style="display:inline-block;margin-top:6px;padding:10px 14px;background:#f8f3ec;border-radius:8px;color:#775a19;font-size:13px;">${data.invitationUrl}</code>

          <hr style="border:none;border-top:1px solid #e6e2db;margin:28px 0;" />

          <h2 style="margin:0 0 10px 0;font-size:15px;color:#1d1c18;">Manage your invitation</h2>
          <p style="margin:0 0 20px 0;color:#45464c;font-size:14px;line-height:1.6;">
            Sign in to your account at <a href="${data.appUrl}" style="color:#775a19;">${data.appUrl}</a> to edit
            names, photos, dates, venues and RSVP settings any time without changing your link.
          </p>
          <p style="margin:0;color:#76777d;font-size:12px;">
            If you were not expecting this email you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Your Wedding Invitation is Ready, ${data.coupleNames}.

Wedding Date: ${data.weddingDate}
Active Until: ${data.expirationDate}
Invitation Link: ${data.invitationUrl}

View it now: ${data.invitationUrl}
Manage it from your account: ${data.appUrl}`;
  return { subject, html, text };
}

export function renderAccountAccessEmail(data: {
  coupleNames: string;
  invitationUrl: string;
  accessUrl: string;
  appUrl: string;
}) {
  const subject = `Your Invite Lime account is ready — ${data.coupleNames}`;
  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#fef9f2;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef9f2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e2db;">
        <tr><td style="height:6px;background:linear-gradient(90deg,#fed488,#775a19,#e9c176);"></td></tr>
        <tr><td style="padding:36px 32px;">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#775a19;font-weight:700;margin-bottom:12px;">Invite Lime Atelier</div>
          <h1 style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:500;color:#1d1c18;font-size:24px;">Your invitation is linked to an account</h1>
          <p style="margin:0 0 24px 0;color:#45464c;font-size:15px;line-height:1.6;">
            <strong>${data.coupleNames}</strong>, your invitation has been added to your Invite Lime account.
            Use the secure link below to open it — no password required. The link signs you in once and you
            can set a password later from your account page.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${data.accessUrl}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;">Access my account</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0 0;color:#76777d;font-size:13px;line-height:1.6;">Your live invitation:</p>
          <p style="margin:6px 0 0 0;"><a href="${data.invitationUrl}" style="color:#775a19;font-size:13px;">${data.invitationUrl}</a></p>
          <p style="margin:28px 0 0 0;color:#76777d;font-size:12px;line-height:1.6;">
            The access link is personal and expires shortly. If you did not request it you can safely ignore this
            email; your invitation stays live for your guests.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Your invitation is linked to a Invite Lime account (${data.coupleNames}).

Access my account: ${data.accessUrl}
Live invitation: ${data.invitationUrl}

The access link is personal and expires shortly. If you did not request it, ignore this email.`;
  return { subject, html, text };
}

/** Same content as the published email, worded for a manual resend. */
export function renderInvitationResendEmail(data: InvitationEmailData) {
  const { html, text } = renderInvitationPublishedEmail(data);
  return {
    subject: `Your Invitation Link — ${data.coupleNames}`,
    html,
    text: `Here is your invitation link again, ${data.coupleNames}.

Wedding Date: ${data.weddingDate}
Active Until: ${data.expirationDate}
Invitation Link: ${data.invitationUrl}

${text}`,
  };
}

export function renderPaymentConfirmedEmail(data: { coupleNames: string; amount: string } & InvitationEmailData) {
  const { subject: _, html, text } = renderInvitationPublishedEmail(data);
  return {
    subject: `Payment Confirmed — ${data.coupleNames}`,
    html,
    text: `Your payment of ${data.amount} has been confirmed.

${text}`,
  };
}