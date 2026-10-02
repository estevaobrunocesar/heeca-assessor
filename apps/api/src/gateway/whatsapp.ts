import type { Request, Response } from "express";
import twilio from "twilio";
import { findUserByPhone } from "../users/service";
import { transcribeAudio, extractTransaction, extractFromReceipt, type ReceiptImage } from "../ai/engine";
import type { Extraction } from "../ai/schema";
import { addDays, format, subDays } from "date-fns";
import { resolveDate } from "../financial/resolveDate";
import { findAccountByMention } from "../financial/accounts";
import { parseDay } from "../financial/bills";
import { todayInBrazil } from "../financial/invoices";
import { registerFromExtraction, getLastTransaction, deleteTransaction, updateTransactionAmount, updateTransactionCategory } from "../financial/engine";
import { answerFinanceQuery, QUERY_GATE_RE } from "./query";
import { answerInvoiceQuery, isInvoiceQuery } from "./invoice";
import { buildReportReply, isReportRequest } from "./report";
import { answerRepeated, isRepeatedQuery } from "./repeated";
import { answerBillList, handleBillCreate, handleBillPayment, isBillListQuery, mightCreateBill, mightPayBill } from "./bills";
import { checkBudgetAlert } from "../financial/budgets";
import { prisma } from "../db/client";

// Replies are sent as TwiML in the webhook response, not via the REST
// client, so no Twilio client needs to be constructed here.

function reply(res: Response, message: string, media: string[] = []) {
  const twiml = new twilio.twiml.MessagingResponse();
  const msg = twiml.message(message);
  for (const url of media) msg.media(url);
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

const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** Fetches a Twilio media file (they require the account credentials), or "too_large". */
async function downloadMedia(url: string): Promise<Buffer | "too_large"> {
  const response = await fetch(url, {
    headers: {
      Authorization: "Basic " + Buffer.from(process.env.TWILIO_ACCOUNT_SID + ":" + process.env.TWILIO_AUTH_TOKEN).toString("base64"),
    },
  });
  if (!response.ok) throw new Error("Could not download media (" + response.status + ")");
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length > MAX_MEDIA_BYTES ? "too_large" : buffer;
}

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

  async function sendReply(message: string, media: string[] = []) {
    if (messageSid) {
      await prisma.webhookEvent.update({ where: { messageSid }, data: { reply: message } }).catch(() => {});
    }
    reply(res, message, media);
  }

  const user = await findUserByPhone(from);
  if (!user) {
    return sendReply("Esse número não está cadastrado como usuário do assessor financeiro. Peça ao administrador para te cadastrar.");
  }

  /** Registers an extracted entry (from text, a transcribed audio or a receipt photo) and writes the reply. */
  async function registerAndReply(
    extraction: Extraction,
    originalText: string,
    source: "text" | "audio" | "photo",
    extraNote = "",
  ) {
    const origin = { text: "WHATSAPP_TEXT", audio: "WHATSAPP_AUDIO", photo: "WHATSAPP_PHOTO" } as const;

    const result = await registerFromExtraction({
      userId: user!.id,
      workspaceId: user!.workspaceId,
      extraction,
      origin: origin[source],
      originalMessage: originalText,
      receivedAt: new Date(),
    });

    await prisma.aiInteractionLog.create({
      data: {
        workspaceId: user!.workspaceId,
        userId: user!.id,
        transactionId: result.kind === "registered" ? result.transactionId : undefined,
        channel: `whatsapp_${source}`,
        originalMessage: body || undefined,
        audioUrl: source === "audio" ? mediaUrl : undefined,
        transcription: source === "audio" ? originalText : undefined,
        model: "gpt-4o-2024-08-06",
        extractedData: extraction,
        confidence: extraction.confianca,
      },
    });

    if (result.kind === "needs_clarification") {
      // Only a photo the model itself could not read gets the "send a clearer
      // one" message; other questions (unknown account...) are passed through.
      const unreadable =
        source === "photo" &&
        !extraction.pergunta_esclarecimento &&
        (extraction.tipo === "INDEFINIDO" || extraction.valor === null || extraction.valor <= 0);
      return sendReply(
        unreadable
          ? "Não consegui ler esse comprovante. Manda outra foto mais nítida, ou escreve o valor e o local."
          : result.question,
      );
    }

    if (result.type === "ADJUSTMENT") {
      const accountName = result.accountName ? `\nConta: ${result.accountName}` : "";
      return sendReply(
        `💳 Pagamento de fatura registrado!\nR$ ${result.amount.toFixed(2)}${accountName}\nO limite do cartão foi atualizado.`,
      );
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
      alertLine = (await checkBudgetAlert(user!.workspaceId, result.categoryId, amountThisMonth)) ?? "";
    }

    let duplicateLine = "";
    if (result.possibleDuplicate) {
      const at = result.possibleDuplicate.createdAt.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
      duplicateLine = `\n⚠️ Parece repetido: você já tinha registrado "${result.possibleDuplicate.description}" com esse mesmo valor nesse dia (às ${at}). Se foi duplicado, mande "apaga o último lançamento".`;
    }

    return sendReply(
      `${emoji} Anotado!\nR$ ${result.amount.toFixed(2)}\nCategoria: ${categoryLine}\nDescrição: ${extraction.descricao}${accountLine}${installmentLine}${extraNote}${alertLine}${duplicateLine}`,
    );
  }

  const mediaType = ((req.body.MediaContentType0 as string | undefined) ?? "").toLowerCase();
  let text = body;
  let receipt: ReceiptImage | null = null;
  if (mediaUrl) {
    if (mediaType.startsWith("image/")) {
      if (!RECEIPT_IMAGE_TYPES.includes(mediaType)) {
        return sendReply("Não consegui abrir essa imagem. Manda a foto do comprovante em JPG ou PNG.");
      }
      const image = await downloadMedia(mediaUrl);
      if (image === "too_large") return sendReply("Essa foto é grande demais. Tenta mandar uma menor, ou escreve o valor e o local.");
      receipt = { contentType: mediaType, base64: image.toString("base64") };
    } else if (mediaType === "" || mediaType.startsWith("audio/")) {
      const audio = await downloadMedia(mediaUrl);
      if (audio === "too_large") return sendReply("Esse áudio é grande demais. Tenta um mais curto.");
      text = await transcribeAudio(audio, "audio.ogg");
    } else {
      return sendReply("Ainda não leio esse tipo de arquivo. Pode mandar uma foto do comprovante, um áudio ou escrever o lançamento.");
    }
  }

  if (!text && !receipt) {
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

  if (receipt) {
    const extraction = await extractFromReceipt(receipt, text, user.workspaceId, new Date());
    // The receipt's own date is the one that counts — unless it looks misread.
    const read = /^\d{4}-\d{2}-\d{2}$/.test(extraction.data_relativa) ? parseDay(extraction.data_relativa) : null;
    const today = todayInBrazil();
    if (!read || read > addDays(today, 1) || read < subDays(today, 400)) extraction.data_relativa = "hoje";

    // A payment method or bank printed on the receipt ("Cartão de Débito",
    // "Banco Inter") is not necessarily one of the user's accounts: use it only
    // if it matches a registered one, otherwise fall back to the default.
    if (extraction.conta && !(await findAccountByMention(extraction.conta, user.workspaceId))) extraction.conta = null;

    // Words that feed the learned keyword rules: the caption plus what was read.
    const words = [text, extraction.estabelecimento, extraction.descricao].filter(Boolean).join(" ");
    const date = format(resolveDate(extraction.data_relativa, new Date()), "dd/MM/yyyy");
    const note = "\n📷 Li do comprovante" + (extraction.estabelecimento ? ": " + extraction.estabelecimento : "") + " · " + date;
    return registerAndReply(extraction, words, "photo", note);
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
    if (!fixed.ok) return sendReply("Não consegui trocar a categoria desse lançamento.");
    const learned = fixed.learnedKeyword ? `\nVou lembrar: "${fixed.learnedKeyword}" → ${fixed.label}.` : "";
    return sendReply(`Categoria corrigida para ${fixed.label}.${learned}`);
  }

  if (isReportRequest(text)) {
    const baseUrl = process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get("host")}`;
    const report = await buildReportReply(text, user, baseUrl);
    return sendReply(report.message, report.media);
  }

  if (isRepeatedQuery(text)) {
    return sendReply(await answerRepeated(user));
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

  return registerAndReply(await extractTransaction(text, user.workspaceId), text, mediaUrl ? "audio" : "text");
}
