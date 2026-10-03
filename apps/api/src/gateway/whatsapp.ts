import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import twilio from "twilio";
import { findUserByPhone } from "../users/service";
import { transcribeAudio, extractTransaction, extractFromReceipt, type ReceiptImage } from "../ai/engine";
import type { Extraction } from "../ai/schema";
import { addDays, format, subDays } from "date-fns";
import { resolveDate } from "../financial/resolveDate";
import { findAccountByMention } from "../financial/accounts";
import { classifyDocument, FriendlyError, type DocumentKind } from "../imports/document";
import { commitImport, latestImportBatch, undoImport, type StagedImport } from "../imports/statement";
import { readAndStageDocument, summarizeStaged } from "./importFile";
import { sendWhatsapp } from "./outbound";
import { answerPeopleList, PEOPLE_LIST_RE } from "./people";
import { answerGoalList, GOALS_LIST_RE, handleGoalContribution } from "./goals";
import { handleSummary } from "./summary";
import { answerFinances, FINANCES_RE } from "./analysis";
import { resolvePerson } from "../financial/people";
import { parseDay } from "../financial/bills";
import { todayInBrazil } from "../financial/invoices";
import { registerFromExtraction, setTransactionPerson, getLastTransaction, deleteTransaction, updateTransactionAmount, updateTransactionCategory } from "../financial/engine";
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
// "muda a pessoa (do último [lançamento]) pra/para X", or the natural "esse gasto foi do Pedro".
const PERSON_SET_RE =
  /(?:muda|mude|troca|corrige|altera|coloca|p[õo]e|marca)\s+(?:a\s+)?pessoa\s+(?:d[oe]\s+(?:[úu]ltimo|ultimo)(?:\s+(?:lan[cç]amento|gasto))?\s+)?(?:pra|para|de|como)\s+(.+)/i;
const PERSON_NATURAL_RE = /^(?:esse|este|o\s+[úu]ltimo)\s+(?:gasto|lan[cç]amento)\s+(?:foi|[eé]|era)\s+(?:d[oae]|pr[ao]|para)\s+(.+)/i;
const PERSON_CLEAR_RE =
  /(?:tira|tire|remove|remova|limpa)\s+(?:a\s+)?pessoa(?:\s+d[oe]\s+(?:[úu]ltimo|ultimo)(?:\s+(?:lan[cç]amento|gasto))?)?\s*$/i;
const CONFIRM_RE = /^(sim|confirmo|confirmar|pode|ok|isso)\b/i;
const CANCEL_RE = /^(n[aã]o|cancela|cancelar)\b/i;
const PENDING_CONFIRMATION_TTL_MS = 5 * 60 * 1000;
// A statement took real work to read, so its confirmation waits longer.
const IMPORT_PENDING_TTL_MS = 30 * 60 * 1000;
const UNDO_IMPORT_RE = /\b(desfaz(?:er)?|apaga(?:r)?|cancela(?:r)?|remove(?:r)?)\s+(?:a\s+)?(?:[úu]ltima\s+)?importa[cç][aã]o\b/i;

const isDocumentMediaType = (type: string) =>
  type === "application/pdf" ||
  type.includes("spreadsheetml") ||
  type === "text/csv" ||
  type === "application/csv" ||
  type === "text/plain" ||
  type === "application/vnd.ms-excel";

/** One confirmation per user: a new one replaces whatever was waiting. */
function setPending(userId: string, action: string, payload: object) {
  const data = payload as Prisma.InputJsonValue;
  return prisma.pendingConfirmation.upsert({
    where: { userId },
    create: { userId, action, payload: data },
    update: { action, payload: data, createdAt: new Date() },
  });
}

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

  // Opens the 24h window in which we may write to this person first (the weekly summary relies on it).
  void prisma.user.update({ where: { id: user.id }, data: { lastWhatsappAt: new Date() } }).catch(() => {});

  /** Registers an extracted entry (from text, a transcribed audio or a receipt photo) and writes the reply. */
  async function registerAndReply(
    extraction: Extraction,
    originalText: string,
    source: "text" | "audio" | "photo" | "file",
    extraNote = "",
    deliver: (message: string) => unknown = sendReply,
  ) {
    const origin = { text: "WHATSAPP_TEXT", audio: "WHATSAPP_AUDIO", photo: "WHATSAPP_PHOTO", file: "WHATSAPP_FILE" } as const;

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
      return deliver(
        unreadable
          ? "Não consegui ler esse comprovante. Manda outra foto mais nítida, ou escreve o valor e o local."
          : result.question,
      );
    }

    if (result.type === "ADJUSTMENT") {
      const accountName = result.accountName ? `\nConta: ${result.accountName}` : "";
      return deliver(
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

    const personLine = result.person ? "\n👤 Pessoa: " + result.person.name + (result.person.created ? " (nova)" : "") : "";

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

    return deliver(
      `${emoji} Anotado!\nR$ ${result.amount.toFixed(2)}\nCategoria: ${categoryLine}\nDescrição: ${extraction.descricao}${accountLine}${personLine}${installmentLine}${extraNote}${alertLine}${duplicateLine}`,
    );
  }

  const mediaType = ((req.body.MediaContentType0 as string | undefined) ?? "").toLowerCase();
  let text = body;
  let receipt: ReceiptImage | null = null;
  let document: { buffer: Buffer; kind: DocumentKind } | null = null;
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
    } else if (isDocumentMediaType(mediaType)) {
      const file = await downloadMedia(mediaUrl);
      if (file === "too_large") return sendReply("Esse arquivo é grande demais (o limite é 8 MB). Tenta exportar um período menor.");
      const kind = classifyDocument(mediaType, file);
      if (!kind) return sendReply("Não consegui abrir esse tipo de planilha. Exporta o extrato em PDF, CSV ou Excel (.xlsx).");
      document = { buffer: file, kind };
    } else {
      return sendReply("Ainda não leio esse tipo de arquivo. Pode mandar uma foto do comprovante, um áudio, um extrato em PDF/CSV/Excel ou escrever o lançamento.");
    }
  }

  if (!text && !receipt && !document) {
    return sendReply("Não recebi nenhum texto ou áudio para interpretar.");
  }

  // A destructive command asks for confirmation instead of acting right
  // away. The confirmation itself only ever applies to whatever is pending
  // for THIS user — an unrelated "sim"/"não" with nothing pending just
  // falls through to normal processing below.
  const pending = await prisma.pendingConfirmation.findUnique({ where: { userId: user.id } });
  if (pending) {
    const isImport = pending.action === "IMPORT_STATEMENT";
    const isFresh = Date.now() - pending.createdAt.getTime() <= (isImport ? IMPORT_PENDING_TTL_MS : PENDING_CONFIRMATION_TTL_MS);
    const confirmed = isFresh && CONFIRM_RE.test(text);
    const cancelled = isFresh && CANCEL_RE.test(text);

    // A statement waiting for its yes/no stays waiting through unrelated
    // messages (it took real work to read). Any other confirmation is dropped
    // by whatever else the user says, and the message is processed normally.
    if (confirmed || cancelled || !(isImport && isFresh)) {
      await prisma.pendingConfirmation.delete({ where: { userId: user.id } });
    }

    if (confirmed) {
      if (isImport) {
        const result = await commitImport(pending.payload as unknown as StagedImport, user);
        const ignored = result.skipped > 0 ? " (" + result.skipped + " já estavam registrados)" : "";
        return sendReply("✅ Importei " + result.imported + " lançamentos" + ignored + ". Se algo ficou errado, mande \"desfazer importação\".");
      }
      if (pending.action === "UNDO_IMPORT") {
        const { batchId } = pending.payload as unknown as { batchId: string };
        const removed = await undoImport(batchId, user.workspaceId);
        return sendReply("Pronto, desfiz a importação: " + removed + " lançamentos removidos.");
      }
      const payload = pending.payload as unknown as DeleteTransactionPayload;
      const result = await deleteTransaction(payload.transactionId, user.workspaceId);
      const suffix = result.count > 1 ? " (" + result.count + " parcelas removidas)" : "";
      return sendReply("Removido: " + payload.description + " — R$ " + payload.amount.toFixed(2) + "." + suffix);
    }
    if (cancelled) {
      return sendReply(
        isImport
          ? "Importação cancelada, nada foi lançado."
          : pending.action === "UNDO_IMPORT"
            ? "Tudo bem, mantive tudo como está."
            : "Tudo bem, não apaguei nada.",
      );
    }
  }

  if (document) {
    const file = document;
    // Twilio waits ~15 seconds for the webhook, and reading a long statement
    // takes longer — so answer now and send the result as its own message.
    await sendReply("📄 Recebi o arquivo. Estou lendo, já te mando o resumo.");
    const deliver = (message: string) => sendWhatsapp(from, message);

    void (async () => {
      try {
        const result = await readAndStageDocument(file.buffer, file.kind, text, user);

        if (result.kind === "empty") {
          return await deliver("Não encontrei lançamentos nesse arquivo.");
        }

        if (result.kind === "single") {
          // One entry (e.g. a receipt exported as PDF): register it like a typed message.
          const { line, accountMention } = result;
          const day = parseDay(line.data);
          const today = todayInBrazil();
          const dateOk = day && day <= addDays(today, 1) && day >= subDays(today, 400);
          const accountName = (await findAccountByMention(text, user.workspaceId))
            ? text
            : accountMention && (await findAccountByMention(accountMention, user.workspaceId))
              ? accountMention
              : null;
          const extraction: Extraction = {
            tipo: line.tipo === "RECEITA" ? "RECEITA" : "DESPESA",
            valor: Math.abs(line.valor),
            categoria: line.categoria,
            subcategoria: line.subcategoria,
            descricao: line.descricao,
            estabelecimento: line.estabelecimento,
            // A counterparty in a document (a PIX recipient) is not "a person of mine".
            pessoa: null,
            relacao: null,
            conta: accountName,
            data_relativa: dateOk ? line.data : "hoje",
            recorrente: false,
            parcelado: false,
            numero_parcelas: null,
            confianca: 0.9,
            pergunta_esclarecimento: null,
          };
          const words = [text, line.estabelecimento, line.descricao].filter(Boolean).join(" ");
          const when = format(resolveDate(extraction.data_relativa, new Date()), "dd/MM/yyyy");
          const note = "\n📄 Li do arquivo" + (line.estabelecimento ? ": " + line.estabelecimento : "") + " · " + when;
          return await registerAndReply(extraction, words, "file", note, deliver);
        }

        // Nothing new to import (everything is already registered): just report it.
        if (result.staged.items.some((i) => !i.duplicate)) {
          await setPending(user.id, "IMPORT_STATEMENT", result.staged);
        }
        await deliver(summarizeStaged(result.staged));
      } catch (err) {
        console.error("Error importing document:", err);
        await deliver(
          err instanceof FriendlyError
            ? err.message
            : "Não consegui ler esse arquivo. Pode mandar de novo, ou me dizer os lançamentos em texto?",
        ).catch(() => {});
      }
    })();
    return;
  }

  if (receipt) {
    const extraction = await extractFromReceipt(receipt, text, user.workspaceId, new Date());
    // The recipient printed on a receipt (a PIX favorecido) is not one of the user's people.
    extraction.pessoa = null;
    extraction.relacao = null;
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

  if (UNDO_IMPORT_RE.test(text)) {
    const batch = await latestImportBatch(user.workspaceId);
    if (!batch) return sendReply("Não encontrei nenhuma importação para desfazer.");
    await setPending(user.id, "UNDO_IMPORT", batch);
    return sendReply("Confirma desfazer a última importação (" + batch.count + " lançamentos)? Responda SIM para confirmar ou NÃO para cancelar.");
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
    await setPending(user.id, "DELETE_TRANSACTION", payload);
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

  const personMatch = text.match(PERSON_SET_RE) ?? text.match(PERSON_NATURAL_RE);
  if (personMatch) {
    const last = await getLastTransaction(user.id, user.workspaceId);
    if (!last) return sendReply("Não encontrei nenhum lançamento recente para atribuir.");
    const mention = personMatch[1].trim().replace(/[.!?]+$/, "");
    const resolved = await resolvePerson(mention, null, user.workspaceId);
    if (!resolved) {
      return sendReply('Não entendi quem é "' + mention + '". Diga o nome da pessoa, por exemplo: "muda a pessoa do último para Marília".');
    }
    const changed = await setTransactionPerson(last.id, user.workspaceId, resolved.person.id);
    if (!changed.ok) return sendReply("Não consegui trocar a pessoa desse lançamento.");
    return sendReply("👤 Pessoa do último lançamento: " + changed.personName + (resolved.created ? " (nova)" : ""));
  }

  if (PERSON_CLEAR_RE.test(text)) {
    const last = await getLastTransaction(user.id, user.workspaceId);
    if (!last) return sendReply("Não encontrei nenhum lançamento recente.");
    await setTransactionPerson(last.id, user.workspaceId, null);
    return sendReply("Tirei a pessoa do último lançamento.");
  }

  if (FINANCES_RE.test(text)) return sendReply(await answerFinances(user));

  const summaryReply = await handleSummary(text, user);
  if (summaryReply) return sendReply(summaryReply);

  const goalReply = await handleGoalContribution(text, user);
  if (goalReply) return sendReply(goalReply);
  if (GOALS_LIST_RE.test(text)) return sendReply(await answerGoalList(text, user));

  if (PEOPLE_LIST_RE.test(text)) {
    return sendReply(await answerPeopleList(user));
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
