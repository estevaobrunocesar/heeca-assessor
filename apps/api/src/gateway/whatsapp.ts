import type { Request, Response } from "express";
import twilio from "twilio";
import { findUserByPhone } from "../users/service";
import { transcribeAudio, extractTransaction } from "../ai/engine";
import { registerFromExtraction, getLastTransaction, deleteTransaction, updateTransactionAmount, updateTransactionCategory } from "../financial/engine";
import { getMonthSummary } from "../financial/queries";
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
const FIX_CATEGORY_RE = /(muda|corrige|mude) (a )?categoria (do último|do ultimo|pra|para) (.+)/i;
const QUERY_MONTH_RE = /quanto (gastei|recebi)|como est[aá]|sobrou|maior (categoria|gasto)/i;

export async function handleIncomingWhatsapp(req: Request, res: Response) {
  const from = req.body.From as string;
  const body = (req.body.Body as string | undefined)?.trim() ?? "";
  const mediaUrl = req.body.MediaUrl0 as string | undefined;

  const user = await findUserByPhone(from);
  if (!user) {
    return reply(res, "Esse número não está cadastrado como usuário do assessor financeiro. Peça ao administrador para te cadastrar.");
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
    return reply(res, "Não recebi nenhum texto ou áudio para interpretar.");
  }

  if (DELETE_LAST_RE.test(text)) {
    const last = await getLastTransaction(user.id);
    if (!last) return reply(res, "Não encontrei nenhum lançamento recente para apagar.");
    await deleteTransaction(last.id);
    return reply(res, `Removido: ${last.description} — R$ ${Number(last.amount).toFixed(2)}.`);
  }

  const fixAmountMatch = text.match(FIX_AMOUNT_RE);
  if (fixAmountMatch) {
    const last = await getLastTransaction(user.id);
    if (!last) return reply(res, "Não encontrei nenhum lançamento recente para corrigir.");
    const amount = Number(fixAmountMatch[3].replace(".", "").replace(",", "."));
    await updateTransactionAmount(last.id, amount);
    return reply(res, `Valor corrigido para R$ ${amount.toFixed(2)}.`);
  }

  const fixCategoryMatch = text.match(FIX_CATEGORY_RE);
  if (fixCategoryMatch) {
    const last = await getLastTransaction(user.id);
    if (!last) return reply(res, "Não encontrei nenhum lançamento recente para corrigir.");
    const categoryName = fixCategoryMatch[4].trim();
    await updateTransactionCategory(last.id, categoryName);
    return reply(res, `Categoria corrigida para ${categoryName}.`);
  }

  if (QUERY_MONTH_RE.test(text)) {
    const summary = await getMonthSummary(new Date(), user.id);
    const topLine = summary.topCategories[0] ? `Maior gasto: ${summary.topCategories[0].name} — R$ ${summary.topCategories[0].total.toFixed(2)}.` : "";
    return reply(
      res,
      `📊 Este mês:\nReceitas: R$ ${summary.income.toFixed(2)}\nDespesas: R$ ${summary.expense.toFixed(2)}\nResultado: R$ ${summary.result.toFixed(2)}\n${topLine}`,
    );
  }

  const extraction = await extractTransaction(text);

  const result = await registerFromExtraction({
    userId: user.id,
    extraction,
    origin: mediaUrl ? "WHATSAPP_AUDIO" : "WHATSAPP_TEXT",
    originalMessage: text,
    receivedAt: new Date(),
  });

  await prisma.aiInteractionLog.create({
    data: {
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
    return reply(res, result.question);
  }

  const emoji = extraction.tipo === "RECEITA" ? "💰" : "⛽";
  return reply(
    res,
    `${emoji} Anotado!\nR$ ${extraction.valor!.toFixed(2)}\nCategoria: ${extraction.categoria}\nDescrição: ${extraction.descricao}`,
  );
}
