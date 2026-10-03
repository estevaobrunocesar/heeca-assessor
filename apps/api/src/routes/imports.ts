import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db/client";
import { classifyDocument, FriendlyError, readDocumentText } from "../imports/document";
import { commitImport, markDuplicates, parseStatement, stageImport, undoImport, type StagedItem } from "../imports/statement";

export const importsRouter = Router();

// Reading a file costs model calls, so uploads are limited per person.
const previewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.auth!.sub,
  standardHeaders: true,
  legacyHeaders: false,
});

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Reads a statement or card bill into a list of entries, without saving anything.
 * The body is the raw file; the card/account is chosen explicitly (?accountId=) so a
 * card bill never lands on the checking account by guesswork.
 */
importsRouter.post("/preview", previewLimiter, express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const accountId = String(req.query.accountId ?? "");
  const account = await prisma.account.findFirst({ where: { id: accountId, workspaceId } });
  if (!account) return res.status(404).json({ error: "account_not_found" });

  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return res.status(400).json({ error: "no_file" });
  const kind = classifyDocument((req.get("content-type") ?? "").split(";")[0].trim(), buffer);
  if (!kind) return res.status(415).json({ error: "unsupported", message: "Envie um PDF, CSV ou Excel (.xlsx)." });

  try {
    const text = await readDocumentText(buffer, kind);
    const parsed = await parseStatement(text, "", workspaceId);
    const staged = await stageImport(parsed, account, workspaceId);
    if (staged.items.length === 0) return res.status(422).json({ error: "empty", message: "Não encontrei lançamentos nesse arquivo." });
    res.json(staged);
  } catch (err) {
    if (err instanceof FriendlyError) return res.status(422).json({ error: "unreadable", message: err.message });
    console.error("Error previewing import:", err);
    res.status(500).json({ error: "failed", message: "Não consegui ler esse arquivo. Tente de novo." });
  }
});

const itemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(200),
  merchant: z.string().max(200).nullable(),
  amount: z.number().positive().max(10_000_000),
  type: z.enum(["EXPENSE", "INCOME", "ADJUSTMENT"]),
  categoryId: z.string().nullable(),
  installmentNo: z.number().int().positive().nullable(),
  installmentTotal: z.number().int().positive().nullable(),
});
const commitSchema = z.object({ accountId: z.string(), items: z.array(itemSchema).min(1).max(500) });

/** Saves the lines the person kept. Everything is re-checked here: the browser is not trusted. */
importsRouter.post("/commit", async (req, res) => {
  const { workspaceId, sub } = req.auth!;
  const body = commitSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid" });

  const account = await prisma.account.findFirst({ where: { id: body.data.accountId, workspaceId } });
  if (!account) return res.status(404).json({ error: "account_not_found" });

  const wanted = [...new Set(body.data.items.map((i) => i.categoryId).filter((id): id is string => !!id))];
  const owned = new Set(
    (await prisma.category.findMany({ where: { workspaceId, id: { in: wanted } }, select: { id: true } })).map((c) => c.id),
  );
  const items: StagedItem[] = body.data.items.map((i) => ({
    ...i,
    categoryId: i.categoryId && owned.has(i.categoryId) ? i.categoryId : null,
    categoryLabel: null,
    duplicate: false,
  }));

  // A second click (or a retry) must not insert the same lines again.
  await markDuplicates(items, workspaceId);
  const result = await commitImport({ accountId: account.id, items }, { id: sub, workspaceId }, "DASHBOARD");
  res.json(result);
});

importsRouter.post("/undo", async (req, res) => {
  const batchId = String(req.body?.batchId ?? "");
  if (!batchId) return res.status(400).json({ error: "invalid" });
  res.json({ removed: await undoImport(batchId, req.auth!.workspaceId) });
});
