import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { deleteTransaction, setTransactionCategory, setTransactionPerson } from "../financial/engine";
import { buildTransactionWhere, csvAmount, csvCell, type TransactionQuery } from "../financial/transactionFilter";

export const transactionsRouter = Router();

transactionsRouter.get("/", async (req, res) => {
  const { page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const where = buildTransactionWhere(req.auth!.workspaceId, req.query as TransactionQuery);

  const take = Math.min(Number(pageSize) || 50, 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, user: true, account: true, toAccount: true, person: true },
      orderBy: { date: "desc" },
      take,
      skip,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ transactions, total, page: Number(page) || 1, pageSize: take });
});

// Same soft-delete the WhatsApp "apagar o último lançamento" flow uses: the
// row stays in the database as DELETED, and deleting any installment of a
// purchase removes the whole purchase.
transactionsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await deleteTransaction(req.params.id, req.auth!.workspaceId);
  if (result.count === 0) return res.status(404).json({ error: "Transaction not found" });
  res.json({ removed: result.count });
});

// Changes a transaction's category (all installments of a purchase move
// together, and the merchant is remembered — see setTransactionCategory).
transactionsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const body = req.body as { categoryId?: string; personId?: string | null };
  const workspaceId = req.auth!.workspaceId;
  const hasPerson = "personId" in body;
  if (!body.categoryId && !hasPerson) return res.status(400).json({ error: "categoryId or personId is required" });

  const out: { label?: string | null; learnedKeyword?: string | null; personName?: string | null } = {};

  if (body.categoryId) {
    const result = await setTransactionCategory(req.params.id, workspaceId, body.categoryId);
    if (!result.ok) {
      const status = result.reason === "not_found" || result.reason === "category_not_found" ? 404 : 400;
      return res.status(status).json({ error: result.reason });
    }
    out.label = result.label;
    out.learnedKeyword = result.learnedKeyword;
  }

  // personId: null removes the attribution.
  if (hasPerson) {
    const result = await setTransactionPerson(req.params.id, workspaceId, body.personId ?? null);
    if (!result.ok) return res.status(404).json({ error: result.reason });
    out.personName = result.personName;
  }

  res.json(out);
});

const EXPORT_LIMIT = 20000;
const TYPE_PT = { INCOME: "Receita", EXPENSE: "Despesa", TRANSFER: "Transferência", ADJUSTMENT: "Ajuste" } as const;
const ORIGIN_PT = { WHATSAPP_TEXT: "WhatsApp (texto)", WHATSAPP_AUDIO: "WhatsApp (áudio)", WHATSAPP_PHOTO: "WhatsApp (foto)", WHATSAPP_FILE: "Arquivo", DASHBOARD: "Painel" } as const;

// The filtered list as a CSV (opens in Excel in pt-BR: ";" separator, comma decimals, UTF-8 with BOM).
transactionsRouter.get("/export.csv", async (req, res) => {
  const where = buildTransactionWhere(req.auth!.workspaceId, req.query as TransactionQuery);
  const rows = await prisma.transaction.findMany({
    where,
    include: { category: { include: { parent: true } }, user: true, account: true, toAccount: true, person: true },
    orderBy: { date: "desc" },
    take: EXPORT_LIMIT,
  });

  const header = ["Data", "Tipo", "Descrição", "Categoria", "Subcategoria", "Usuário", "Pessoa", "Conta", "Conta destino", "Valor", "Origem", "Parcela"];
  const lines = rows.map((t) =>
    [
      t.date.toISOString().slice(0, 10),
      TYPE_PT[t.type],
      t.description,
      t.category?.parent?.name ?? t.category?.name ?? "",
      t.category?.parent ? t.category.name : "",
      t.user.name,
      t.person?.name ?? "",
      t.account?.name ?? "",
      t.toAccount?.name ?? "",
      csvAmount(Number(t.amount)),
      ORIGIN_PT[t.origin],
      t.installmentNo ? `${t.installmentNo}/${t.installmentTotal}` : "",
    ]
      .map(csvCell)
      .join(";"),
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="lancamentos-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n");
});

// Everything known about one entry, for auditing: where it came from, what was said, what the AI read.
transactionsRouter.get("/:id", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const t = await prisma.transaction.findFirst({
    where: { id: req.params.id, workspaceId },
    include: {
      category: { include: { parent: true } },
      user: { select: { name: true } },
      account: true,
      toAccount: true,
      person: true,
      aiLogs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!t) return res.status(404).json({ error: "Transaction not found" });

  const ai = t.aiLogs[0];
  res.json({
    id: t.id,
    type: t.type,
    status: t.status,
    amount: Number(t.amount),
    description: t.description,
    date: t.date,
    createdAt: t.createdAt,
    category: t.category ? { name: t.category.name, parent: t.category.parent?.name ?? null } : null,
    user: t.user.name,
    person: t.person?.name ?? null,
    account: t.account?.name ?? null,
    toAccount: t.toAccount?.name ?? null,
    merchant: t.merchant,
    installment: t.installmentNo ? { no: t.installmentNo, total: t.installmentTotal } : null,
    origin: t.origin,
    originalMessage: t.originalMessage,
    aiConfidence: t.aiConfidence,
    hasAudio: ai?.audioId != null,
    ai: ai ? { model: ai.model, transcription: ai.transcription, confidence: ai.confidence, extractedData: ai.extractedData, createdAt: ai.createdAt } : null,
  });
});

// The original voice message of an entry (scoped to the workspace like everything else).
transactionsRouter.get("/:id/audio", async (req, res) => {
  const log = await prisma.aiInteractionLog.findFirst({
    where: { transactionId: req.params.id, workspaceId: req.auth!.workspaceId, audioId: { not: null } },
    include: { audio: true },
    orderBy: { createdAt: "desc" },
  });
  if (!log?.audio) return res.status(404).json({ error: "Audio not found" });
  res.setHeader("Content-Type", log.audio.contentType);
  res.setHeader("Content-Length", String(log.audio.data.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(log.audio.data));
});
