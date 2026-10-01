import { Router } from "express";
import { prisma } from "../db/client";
import type { Prisma, TransactionType } from "@prisma/client";

export const transactionsRouter = Router();

transactionsRouter.get("/", async (req, res) => {
  const { from, to, categoryId, userId, type, page = "1", pageSize = "50" } = req.query as Record<string, string>;

  const where: Prisma.TransactionWhereInput = { status: "CONFIRMED" };
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
