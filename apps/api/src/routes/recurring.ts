import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import type { TransactionType } from "@prisma/client";

export const recurringRouter = Router();

recurringRouter.get("/", async (req, res) => {
  const rules = await prisma.recurringRule.findMany({
    where: { workspaceId: req.auth!.workspaceId },
    include: { category: true, account: true },
    orderBy: { dayOfMonth: "asc" },
  });
  res.json(rules);
});

recurringRouter.post("/", requireAdmin, async (req, res) => {
  const { description, amount, type, dayOfMonth, categoryId, accountId } = req.body as {
    description?: string;
    amount?: number;
    type?: TransactionType;
    dayOfMonth?: number;
    categoryId?: string;
    accountId?: string;
  };

  if (!description || typeof amount !== "number" || amount <= 0 || !type || !dayOfMonth) {
    return res.status(400).json({ error: "description, amount, type and dayOfMonth are required" });
  }
  if (dayOfMonth < 1 || dayOfMonth > 28) {
    return res.status(400).json({ error: "dayOfMonth must be between 1 and 28 (to be valid in every month)" });
  }

  const rule = await prisma.recurringRule.create({
    data: {
      workspaceId: req.auth!.workspaceId,
      userId: req.auth!.sub,
      description,
      amount,
      type,
      dayOfMonth,
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
    },
  });

  res.status(201).json(rule);
});

recurringRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { active } = req.body as { active?: boolean };
  const result = await prisma.recurringRule.updateMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
    data: { active },
  });
  if (result.count === 0) return res.status(404).json({ error: "Rule not found" });
  res.json({ ok: true });
});

recurringRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await prisma.recurringRule.deleteMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  if (result.count === 0) return res.status(404).json({ error: "Rule not found" });
  res.status(204).send();
});
