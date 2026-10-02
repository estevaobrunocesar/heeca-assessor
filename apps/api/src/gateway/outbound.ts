import twilio from "twilio";

/**
 * Sends a WhatsApp message outside the webhook response. Used when the work
 * (reading a long statement) outlasts the ~15 seconds Twilio waits for a
 * reply: the webhook answers at once and the result arrives as a separate
 * message — allowed because the user's own message opened a 24h window.
 *
 * WHATSAPP_OUTBOUND=log prints instead of sending, for local development,
 * where the credentials are real but the test phone numbers are not.
 */
export async function sendWhatsapp(to: string, body: string): Promise<void> {
  if (process.env.WHATSAPP_OUTBOUND === "log") {
    console.log(`[whatsapp outbound -> ${to}]\n${body}\n[/whatsapp outbound]`);
    return;
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  await client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER!, to, body });
}
