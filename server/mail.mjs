import nodemailer from "nodemailer";

export function getMailTransport() {
  const { SMTP_USER, SMTP_APP_PASSWORD, SMTP_HOST, SMTP_PORT } = process.env;
  if (!SMTP_USER || !SMTP_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST || "smtp.gmail.com",
    port: Number(SMTP_PORT) || 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_APP_PASSWORD },
  });
}

// A handful of real, independent spam-score factors most automated CRM
// emails get wrong. None of these guarantee inbox placement on their own —
// see docs/email-deliverability-notes.md for what's actually decisive
// (domain authentication) versus what content-level fixes can and can't do.
function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|table|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendMail({
  to,
  subject,
  html,
  text,
  replyTo,
  attachmentBase64,
  attachmentFilename,
}) {
  const transport = getMailTransport();
  if (!transport) {
    throw new Error("Email not configured. Add SMTP_USER and SMTP_APP_PASSWORD to server/.env.");
  }
  const attachments = attachmentBase64
    ? [
        {
          filename: attachmentFilename || "report.pdf",
          content: Buffer.from(attachmentBase64, "base64"),
        },
      ]
    : [];
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || "Time Global Tech";
  await transport.sendMail({
    // A bare address as "From" (no display name) is a common spam signal —
    // pairing it with a name matches what a real transactional email looks
    // like. Reply-To defaults to the same address so a reply doesn't bounce.
    from: `"${fromName}" <${fromAddress}>`,
    to,
    replyTo: replyTo || fromAddress,
    subject,
    html: html || "",
    // Filters penalize HTML-only email (no text/plain part) — auto-derive
    // one from the HTML if the caller didn't provide its own.
    text: text || htmlToPlainText(html),
    attachments,
  });
}
