import { prisma } from "../db/client";

/** Order of a message's life; a late "sent" callback must never overwrite "delivered". */
const RANK: Record<string, number> = { accepted: 0, queued: 1, sending: 2, sent: 3, delivered: 4, read: 5 };
const FAILED = new Set(["failed", "undelivered"]);

export const isFailure = (status: string) => FAILED.has(status);

/** The status to keep: failures win once reported, otherwise the furthest along (callbacks can arrive out of order). */
export function nextStatus(current: string | null, incoming: string): string {
  if (!current) return incoming;
  if (isFailure(current)) return current;
  if (isFailure(incoming)) return incoming;
  return (RANK[incoming] ?? -1) >= (RANK[current] ?? -1) ? incoming : current;
}

/** Plain-language reasons for the Twilio errors that actually happen with WhatsApp. */
const REASONS: Record<string, string> = {
  "63016": "Fora da janela de 24 h: a pessoa não escreveu nas últimas 24 horas e a mensagem não era um template aprovado.",
  "63015": "A pessoa ainda não entrou no sandbox da Twilio.",
  "63024": "Número de destino inválido para o WhatsApp.",
  "63032": "A pessoa bloqueou ou optou por não receber mensagens deste número.",
  "63049": "A Meta recusou entregar esta mensagem (política de marketing).",
  "63051": "A conta do WhatsApp Business está bloqueada ou restrita.",
  "63003": "Não foi possível entregar: o número não tem WhatsApp.",
  "21614": "Número de destino inválido.",
};
export const reasonFor = (code: string | null) => (code ? (REASONS[code] ?? `Erro ${code} da Twilio.`) : null);

const toPlainPhone = (to: string) => to.replace(/^whatsapp:/, "");

async function workspaceOfPhone(phone: string): Promise<string | null> {
  return (await prisma.user.findUnique({ where: { whatsappPhone: phone }, select: { workspaceId: true } }))?.workspaceId ?? null;
}

/** Remembers a message we just sent, so the callbacks that follow can update it. Never throws. */
export async function trackOutbound(sid: string, to: string, status: string): Promise<void> {
  try {
    const phone = toPlainPhone(to);
    await prisma.whatsappDelivery.upsert({
      where: { sid },
      create: { sid, toPhone: phone, status, workspaceId: await workspaceOfPhone(phone) },
      update: {},
    });
  } catch (err) {
    console.error("Could not track the WhatsApp delivery:", err);
  }
}

/** Applies a Twilio status callback. Unknown messages (replies sent as TwiML, for instance) are recorded too. */
export async function applyStatusCallback(body: { MessageSid?: string; MessageStatus?: string; To?: string; ErrorCode?: string; ErrorMessage?: string }) {
  const sid = body.MessageSid;
  const status = (body.MessageStatus ?? "").toLowerCase();
  if (!sid || !status) return false;

  const phone = toPlainPhone(body.To ?? "");
  const existing = await prisma.whatsappDelivery.findUnique({ where: { sid } });
  const merged = nextStatus(existing?.status ?? null, status);
  const failedNow = isFailure(merged);

  await prisma.whatsappDelivery.upsert({
    where: { sid },
    create: {
      sid,
      toPhone: phone,
      status: merged,
      errorCode: failedNow ? (body.ErrorCode ?? null) : null,
      errorMessage: failedNow ? (body.ErrorMessage ?? null) : null,
      workspaceId: phone ? await workspaceOfPhone(phone) : null,
    },
    update: {
      status: merged,
      ...(failedNow && body.ErrorCode ? { errorCode: body.ErrorCode, errorMessage: body.ErrorMessage ?? null } : {}),
    },
  });
  return true;
}
