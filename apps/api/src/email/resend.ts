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
