import { sendEmail } from "@/lib/services/email";
import { jsonError, readBody } from "@/lib/services/helpers";
import { contactSchema } from "@/lib/validators";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Please check the form fields.", parsed.error.flatten());

    // Rate limit: 5 contact messages per IP per hour
    const limit = await consumeRateLimit({
      bucket: "contact",
      key: clientKey(req),
      limit: 5,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many messages sent. Please try again later.");
    }

    const to = process.env.EMAIL_FROM || "support@invite-lime.example";

    const result = await sendEmail({
      to,
      subject: `[Invite Lime Contact] ${parsed.data.subject}`,
      html: `<p><strong>Name:</strong> ${escapeHtml(parsed.data.name)}</p>
             <p><strong>Email:</strong> ${escapeHtml(parsed.data.email)}</p>
             <p><strong>Subject:</strong> ${escapeHtml(parsed.data.subject)}</p>
             <hr/><p>${escapeHtml(parsed.data.message).replace(/\n/g, "<br/>")}</p>`,
      text: `Name: ${parsed.data.name}\nEmail: ${parsed.data.email}\nSubject: ${parsed.data.subject}\n\n${parsed.data.message}`,
      templateKey: "contact_form",
    });

    if (!result.ok) {
      return jsonError(result.error?.includes("configured") ? 503 : 500, "Message queued to be reviewed — we are offline for maintenance.");
    }

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not send message");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}