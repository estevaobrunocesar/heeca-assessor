import type { Request, Response } from "express";
import twilio from "twilio";
import { findUserByPhone } from "../users/service";
import { transcribeAudio, extractTransaction } from "../ai/engine";
import { registerFromExtraction, getLastTransaction, deleteTransaction, updateTransactionAmount, updateTransactionCategory } from "../financial/engine";
import { answerFinanceQuery, QUERY_GATE_RE } from "./query";
import { answerInvoiceQuery, isInvoiceQuery } from "./invoice";
import { answerBillList, handleBillCreate, handleBillPayment, isBillListQuery, mightCreateBill, mightPayBill } from "./bills";
import { checkBudgetAlert } from "../financial/budgets";
import { prisma } from "../db/client";

// Replies are sent as TwiML in the webhook response, not via the REST
// client, so no Twilio client needs to be constructed here.

function reply(res: Response, message: string) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  res.type("text/xml").send(twiml.toString());
}

const DELETE_LAST_RE = /apag(a|ar) o (último|ultimo) lan[cç]amento/i;
const FIX_AMOUNT_RE = /corrig(e|ir) o (último|ultimo) (lan[cç]amento )?para (?:r\$ ?)?([\d.,]+)/i;
// "muda a categoria (do último [lançamento]) pra/para X" — the optional
// "do último" clause is consumed before pra/para so it never leaks into X.
const FIX_CATEGORY_RE =
  /(?:muda|mude|corrige|corrija|altera|troca)\s+(?:a\s+)?categoria\s+(?:d[oe]\s+(?:[úu]ltimo|ultimo)(?:\s+(?:lan[cç]amento|gasto))?\s+)?(?:pra|para|de)\s+(.+)/i;
const CONFIRM_RE = /^(sim|confirmo|confirmar|pode|ok|isso)\b/i;
const CANCEL_RE = /^(n[aã]o|cancela|cancelar)\b/i;
const PENDING_CONFIRMATION_TTL_MS = 5 * 60 * 1000;

type DeleteTransactionPayload = { transactionId: string; description: string; amount: number };

export async function handleIncomingWhatsapp(req: Request, res: Response) {
  try {
    await processIncomingWhatsapp(req, res);
  } catch (err) {
    console.error("Error handling WhatsApp webhook:", err);
    // The dedupe row was already claimed before processing failed, with no
    // reply stored — clear it so a genuine Twilio retry can reprocess the
    // message instead of getting stuck echoing "processando" forever.
    const messageSid = req.body.MessageSid as string | undefined;
    if (messageSid) {
      await prisma.webhookEvent.delete({ where: { messageSid } }).catch(() => {});
    }
    reply(res, "Deu um erro aqui do meu lado processando sua mensagem. Pode tentar de novo em instantes?");
  }
}

async function processIncomingWhatsapp(req: Request, res: Response) {
  const from = req.body.From as string;
  const body = (req.body.Body as string | undefined)?.trim() ?? "";
  const mediaUrl = req.body.MediaUrl0 as string | undefined;
  const messageSid = req.body.MessageSid as string | undefined;

  // Twilio retries a webhook delivery whenever it doesn't get a timely 2xx
  // response (slow request, transient 5xx, network blip) — using the SAME
  // MessageSid. Without this check, a retry would re-run the AI extraction
  // and register the transaction a second time. Claiming the row here, before
  // any real work starts, makes a duplicate delivery a no-op instead.
  if (messageSid) {
    try {
      await prisma.webhookEvent.create({ data: { messageSid } });
    } catch (err: any) {
      if (err?.code === "P2002") {
        const existing = await prisma.webhookEvent.findUnique({ where: { messageSid } });
        return reply(res, existing?.reply ?? "Já recebi essa mensagem e estou processando — um instante.");
      }
      throw err;
    }
  }

  async function sendReply(message: string) {
    if (messageSid) {
      await prisma.webhookEvent.update({ where: { messageSid }, data: { reply: message } }).catch(() => {});
    }
    reply(res, message);
  }

  const user = await findUserByPhone(from);
  if (!user) {
    return sendReply("Esse número não está cadastrado como usuário do assessor financeiro. Peça ao administrador para te cadastrar.");
  }

  let text = body;
  if (mediaUrl) {
    const audioResponse = await fetch(mediaUrl, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
      },
    });
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    text = await transcribeAudio(audioBuffer, "audio.ogg");
  }

  if (!text) {
    return sendReply("Não recebi nenhum texto ou áudio para interpretar.");
  }

  // A destructive command asks for confirmation instead of acting right
  // away. The confirmation itself only ever applies to whatever is pending
  // for THIS user — an unrelated "sim"/"não" with nothing pending just
  // falls through to normal processing below.
  const pending = await prisma.pendingConfirmation.findUnique({ where: { userId: user.id } });
  if (pending) {
    const isFresh = Date.now() - pending.createdAt.getTime() <= PENDING_CONFIRMATION_TTL_MS;
    await prisma.pendingConfirmation.delete({ where: { userId: user.id } });

    if (isFresh && CONFIRM_RE.test(text)) {
      const payload = pending.payload as unknown as DeleteTransactionPayload;
      const result = await deleteTransaction(payload.transactionId, user.workspaceId);
      const suffix = result.count > 1 ? ` (${result.count} parcelas removidas)` : "";
      return sendReply(`Removido: ${payload.description} — R$ ${payload.amount.toFixed(2)}.${suffix}`);
    }
    if (isFresh && CANCEL_RE.test(text)) {
      return sendReply("Tudo bem, não apaguei nada.");
    }
    // Ambiguous reply or a stale (>5min) confirmation — drop it silently and
    // keep processing this message as a new, unrelated command.
  }

  if (DELETE_LAST_RE.test(text)) {
    const last = await getLastTransaction(user.id, user.workspaceId);
    if (!last) return sendReply("Não encontrei nenhum lançamento recente para apagar.");
    // Deleting an installment purchase removes every parcela, so describe the
    // whole purchase rather than just whichever row happens to be the latest.
    const installments = last.isInstallment ? last.installmentTotal : null;
    const payload: DeleteTransactionPayload = {
      transactionId: last.id,
      description: installments ? last.description.replace(/\s*\(parcela \d+\/\d+\)$/, "") : last.description,
      amount: Number(last.amount) * (installments ?? 1),
    };
    await prisma.pendingConfirmation.create({
      data: { userId: user.id, action: "DELETE_TRANSACTION", payload },
    });
    const installmentNote = installments ? ` (compra parcelada em ${installments}x)` : "";
    return sendReply(
      `Confirma apagar "${payload.description}" — R$ ${payload.amount.toFixed(2)}${installmentNote}? Responda SIM para confirmar ou NÃO para cancelar.`,
    );
  }

  const fixAmountMatch = text.match(FIX_AMOUNT_RE);
  if (fixAmountMatch) {
    const last = await getLastTransaction(user.id, user.workspaceId);
    if (!last) return sendReply("Não encontrei nenhum lançamento recente para corrigir.");
    const amount = Number(fixAmountMatch[3].replace(".", "").replace(",", "."));
    await updateTransactionAmount(last.id, user.workspaceId, amount);
    return sendReply(`Valor corrigido para R$ ${amount.toFixed(2)}.`);
  }

  const fixCategoryMatch = text.match(FIX_CATEGORY_RE);
  if (fixCategoryMatch) {
    const last = await getLastTransaction(user.id, user.workspaceId);
    if (!last) return sendReply("Não encontrei nenhum lançamento recente para corrigir.");
    const categoryName = fixCategoryMatch[1].trim().replace(/[.!?]+$/, "");
    const fixed = await updateTransactionCategory(last.id, user.workspaceId, categoryName);
    const learned = fixed.learnedKeyword ? `\nVou lembrar: "${fixed.learnedKeyword}" → ${fixed.label}.` : "";
    return sendReply(`Categoria corrigida para ${fixed.label}.${learned}`);
  }

  if (isInvoiceQuery(text)) {
    return sendReply(await answerInvoiceQuery(text, user));
  }

  if (isBillListQuery(text)) {
    return sendReply(await answerBillList(user));
  }

  if (mightPayBill(text)) {
    const answer = await handleBillPayment(text, user);
    if (answer) return sendReply(answer);
  }

  if (mightCreateBill(text)) {
    const answer = await handleBillCreate(text, user);
    if (answer) return sendReply(answer);
  }

  if (QUERY_GATE_RE.test(text)) {
    const answer = await answerFinanceQuery(text, user);
    if (answer) return sendReply(answer);
  }

  const extraction = await extractTransaction(text, user.workspaceId);

  const result = await registerFromExtraction({
    userId: user.id,
    workspaceId: user.workspaceId,
    extraction,
    origin: mediaUrl ? "WHATSAPP_AUDIO" : "WHATSAPP_TEXT",
    originalMessage: text,
    receivedAt: new Date(),
  });

  await prisma.aiInteractionLog.create({
    data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      transactionId: result.kind === "registered" ? result.transactionId : undefined,
      channel: mediaUrl ? "whatsapp_audio" : "whatsapp_text",
      originalMessage: body || undefined,
      audioUrl: mediaUrl,
      transcription: mediaUrl ? text : undefined,
      model: "gpt-4o-2024-08-06",
      extractedData: extraction,
      confidence: extraction.confianca,
    },
  });

  if (result.kind === "needs_clarification") {
    return sendReply(result.question);
  }

  if (result.type === "ADJUSTMENT") {
    const accountName = result.accountName ? `
Conta: ${result.accountName}` : "";
    return sendReply(`💳 Pagamento de fatura registrado!
R$ ${result.amount.toFixed(2)}${accountName}
O limite do cartão foi atualizado.`);
  }

  const emoji = extraction.tipo === "RECEITA" ? "💰" : "💸";
  const accountLine = result.accountName ? `\nConta: ${result.accountName}` : "";
  // The category actually stored, which a learned/known keyword may have
  // chosen over what the AI named.
  const categoryLine = result.categoryLabel ?? extraction.categoria;
  const installmentLine = result.installments
    ? `\nParcelado em ${result.installments.total}x de R$ ${result.installments.amountEach.toFixed(2)}`
    : "";

  let alertLine = "";
  if (result.type === "EXPENSE" && result.categoryId) {
    // Only the first installment actually lands in this month's spend —
    // that's the figure the budget threshold check needs, not the total.
    const amountThisMonth = result.installments ? result.installments.amountEach : result.amount;
    alertLine = (await checkBudgetAlert(user.workspaceId, result.categoryId, amountThisMonth)) ?? "";
  }

  return sendReply(
    `${emoji} Anotado!\nR$ ${result.amount.toFixed(2)}\nCategoria: ${categoryLine}\nDescrição: ${extraction.descricao}${accountLine}${installmentLine}${alertLine}`,
  );
}
