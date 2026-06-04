import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
  return transporter;
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@brightinsight.com";
  try {
    await t.sendMail({ from, to: Array.isArray(to) ? to.join(", ") : to, subject, html });
    return true;
  } catch {
    return false;
  }
}

export async function sendBulkEmails(
  recipients: { email: string; name?: string | null }[],
  subject: string,
  htmlTemplate: (name: string) => string,
): Promise<{ sent: number; failed: number }> {
  const t = getTransporter();
  if (!t) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    try {
      await sendEmail(r.email, subject, htmlTemplate(r.name ?? r.email));
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
