import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { getBudgetStatus } from "../financial/budgets";

export const budgetsRouter = Router();

budgetsRouter.get("/", async (req, res) => {
  const status = await getBudgetStatus(req.auth!.workspaceId);
  res.json(status);
});

budgetsRouter.post("/", requireAdmin, async (req, res) => {
  const { categoryId, monthlyLimit } = req.body as { categoryId?: string; monthlyLimit?: number };
  if (!categoryId || typeof monthlyLimit !== "number" || monthlyLimit <= 0) {
    return res.status(400).json({ error: "categoryId and a positive monthlyLimit are required" });
  }

  const budget = await prisma.budget.upsert({
    where: { workspaceId_categoryId: { workspaceId: req.auth!.workspaceId, categoryId } },
    update: { monthlyLimit },
    create: { workspaceId: req.auth!.workspaceId, categoryId, monthlyLimit },
  });

  res.status(201).json(budget);
});

budgetsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await prisma.budget.deleteMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  if (result.count === 0) return res.status(404).json({ error: "Budget not found" });
  res.status(204).send();
});
