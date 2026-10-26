/**
 * @deprecated Consolidated into ./email-templates, which is the single source
 * of truth for transactional email templates. Kept only so older imports of
 * this path do not break — do not add new templates here.
 */
export function legacyRenderAccountAccessEmail(data: {
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
            Use the secure link below to open it — no password required. The link signs you in once and
            you can set a password later from your account page.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${data.accessUrl}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;">Access my account</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0 0;color:#76777d;font-size:13px;line-height:1.6;">Your live invitation:</p>
          <p style="margin:6px 0 0 0;"><a href="${data.invitationUrl}" style="color:#775a19;font-size:13px;">${data.invitationUrl}</a></p>
          <p style="margin:28px 0 0 0;color:#76777d;font-size:12px;line-height:1.6;">
            The access link is personal and expires shortly. If you did not request it you can safely ignore this email;
            your invitation stays live for your guests.
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
