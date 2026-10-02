import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { deleteTransaction } from "../financial/engine";
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
      include: { category: true, user: true, account: true },
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
