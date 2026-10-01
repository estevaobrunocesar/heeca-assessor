import { Router } from "express";
import { getMonthSummary } from "../financial/queries";
import { prisma } from "../db/client";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (req, res) => {
  const summary = await getMonthSummary(new Date());
  res.json(summary);
});

dashboardRouter.get("/transactions", async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { status: "CONFIRMED" },
    include: { category: true, user: true },
    orderBy: { date: "desc" },
    take: 100,
  });
  res.json(transactions);
});
