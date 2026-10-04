import twilio from "twilio";
import { trackOutbound } from "./deliveries";

/**
 * Where Twilio reports what became of a message (queued, sent, delivered, read, failed). Needs the
 * public address of this API; without it messages still go out, they just are not followed.
 */
function statusCallbackUrl(): string | undefined {
  const base = process.env.PUBLIC_API_URL;
  return base ? `${base.replace(/\/+$/, "")}/webhook/whatsapp/status` : undefined;
}

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
  const message = await client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER!, to, body, statusCallback: statusCallbackUrl() });
  await trackOutbound(message.sid, to, message.status);
}

/**
 * Sends an approved WhatsApp template. This is the only way to write to someone first once the
 * 24h window has closed. Template variables cannot contain line breaks, tabs or long runs of spaces.
 */
export async function sendWhatsappTemplate(to: string, contentSid: string, variables: Record<string, string>): Promise<void> {
  if (process.env.WHATSAPP_OUTBOUND === "log") {
    console.log(`[whatsapp outbound template ${contentSid} -> ${to}] ${JSON.stringify(variables)}`);
    return;
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  const message = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER!,
    to,
    contentSid,
    contentVariables: JSON.stringify(variables),
    statusCallback: statusCallbackUrl(),
  });
  await trackOutbound(message.sid, to, message.status);
}
