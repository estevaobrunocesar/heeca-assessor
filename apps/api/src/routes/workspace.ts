import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";

export const workspaceRouter = Router();

/** Full export of everything this workspace owns, as a single JSON document. */
workspaceRouter.get("/export", requireAdmin, async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const [workspace, users, accounts, categories, transactions, budgets, recurringRules, bills] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.user.findMany({
      where: { workspaceId },
      select: { id: true, name: true, email: true, whatsappPhone: true, role: true, status: true, createdAt: true },
    }),
    prisma.account.findMany({ where: { workspaceId } }),
    prisma.category.findMany({ where: { workspaceId } }),
    prisma.transaction.findMany({ where: { workspaceId }, include: { category: true, account: true, user: { select: { name: true } } } }),
    prisma.budget.findMany({ where: { workspaceId } }),
    prisma.recurringRule.findMany({ where: { workspaceId } }),
    prisma.bill.findMany({ where: { workspaceId } }),
  ]);

  res.setHeader("Content-Disposition", `attachment; filename="meu-assessor-export-${workspaceId}.json"`);
  res.json({ exportedAt: new Date().toISOString(), workspace, users, accounts, categories, transactions, budgets, recurringRules, bills });
});

/**
 * Permanently deletes this workspace and everything in it. Requires the
 * caller to re-type the workspace name as confirmation, since this can't be
 * undone.
 */
workspaceRouter.delete("/", requireAdmin, async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const { confirmName } = req.body as { confirmName?: string };

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  if (confirmName !== workspace.name) {
    return res.status(400).json({ error: "O nome de confirmação não bate com o nome do workspace." });
  }

  await prisma.$transaction([
    prisma.aiInteractionLog.deleteMany({ where: { workspaceId } }),
    prisma.transaction.deleteMany({ where: { workspaceId } }),
    prisma.recurringRule.deleteMany({ where: { workspaceId } }),
    prisma.bill.deleteMany({ where: { workspaceId } }),
    prisma.budget.deleteMany({ where: { workspaceId } }),
    prisma.account.deleteMany({ where: { workspaceId } }),
    prisma.category.deleteMany({ where: { workspaceId } }),
    prisma.passwordResetToken.deleteMany({ where: { user: { workspaceId } } }),
    prisma.pendingConfirmation.deleteMany({ where: { user: { workspaceId } } }),
    prisma.user.deleteMany({ where: { workspaceId } }),
    prisma.workspace.delete({ where: { id: workspaceId } }),
  ]);

  res.status(204).send();
});
