import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { deleteTransaction, setTransactionCategory, setTransactionPerson } from "../financial/engine";
import type { Prisma, TransactionType } from "@prisma/client";

export const transactionsRouter = Router();

transactionsRouter.get("/", async (req, res) => {
  const { from, to, categoryId, userId, type, page = "1", pageSize = "50" } = req.query as Record<string, string>;

  const where: Prisma.TransactionWhereInput = { workspaceId: req.auth!.workspaceId, status: "CONFIRMED" };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }
  if (categoryId) where.categoryId = categoryId;
  if (userId) where.userId = userId;
  if (type) where.type = type as TransactionType;

  const take = Math.min(Number(pageSize) || 50, 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, user: true, account: true, person: true },
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
