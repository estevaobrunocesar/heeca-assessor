import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM_EMAIL ?? "Meu Assessor <onboarding@resend.dev>";

// Lazily constructed, and tolerant of a missing key — forgot-password should
// degrade to a clear error instead of crashing the whole API at startup
// (unlike JWT_SECRET, this isn't required for the app's core purpose).
const client = apiKey ? new Resend(apiKey) : null;

export function isEmailConfigured() {
  return client !== null;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!client) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  await client.emails.send({
    from: fromAddress,
    to,
    subject: "Redefinir sua senha — Meu Assessor",
    html: `
      <p>Você pediu para redefinir sua senha no Meu Assessor.</p>
      <p><a href="${resetUrl}">Clique aqui para escolher uma nova senha</a></p>
      <p>Esse link expira em 1 hora. Se você não pediu isso, pode ignorar este e-mail.</p>
    `,
  });
}

export async function sendReportEmail(
  to: string,
  message: { subject: string; html: string; attachments: { filename: string; content: Buffer }[] },
) {
  if (!client) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  // The SDK reports failures as { error } instead of throwing; surface them so callers can retry.
  const { error } = await client.emails.send({ from: fromAddress, to, ...message });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendGoalAlertEmail(to: string, message: { subject: string; html: string }) {
  if (!client) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const { error } = await client.emails.send({ from: fromAddress, to, ...message });
  if (error) throw new Error(`Resend: ${error.message}`);
}

/** A plain notification e-mail (subject + HTML), for digests and alerts. */
export async function sendNotificationEmail(to: string, message: { subject: string; html: string }) {
  if (!client) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const { error } = await client.emails.send({ from: fromAddress, to, ...message });
  if (error) throw new Error(`Resend: ${error.message}`);
}
