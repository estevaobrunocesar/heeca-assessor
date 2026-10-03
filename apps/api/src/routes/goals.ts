import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { addContribution, getGoal, listGoals } from "../financial/goals";

export const goalsRouter = Router();

const MAX_TARGET = 100_000_000;

/** YYYY-MM-DD as a calendar date stored in UTC (no timezone drift); null for empty, undefined if invalid. */
function parseDeadline(value: unknown): Date | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return undefined;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : undefined;
}

goalsRouter.get("/", async (req, res) => {
  res.json(await listGoals(req.auth!.workspaceId));
});

goalsRouter.get("/:id", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const goal = await getGoal(req.params.id, workspaceId);
  if (!goal) return res.status(404).json({ error: "Goal not found" });
  const history = await prisma.goalContribution.findMany({
    where: { goalId: goal.id, workspaceId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { name: true } } },
  });
  res.json({
    ...goal,
    history: history.map((h) => ({ id: h.id, amount: Number(h.amount), note: h.note, createdAt: h.createdAt, by: h.user.name })),
  });
});

goalsRouter.post("/", requireAdmin, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const targetAmount = req.body?.targetAmount;
  const deadline = parseDeadline(req.body?.deadline);
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "name (2 to 60 characters) is required" });
  if (typeof targetAmount !== "number" || !(targetAmount > 0) || targetAmount > MAX_TARGET) {
    return res.status(400).json({ error: "targetAmount must be a positive number" });
  }
  if (deadline === undefined) return res.status(400).json({ error: "deadline must be YYYY-MM-DD" });

  const workspaceId = req.auth!.workspaceId;
  const exists = await prisma.savingsGoal.findFirst({ where: { workspaceId, name: { equals: name, mode: "insensitive" } } });
  if (exists) return res.status(409).json({ error: "Já existe uma meta com esse nome." });

  const goal = await prisma.savingsGoal.create({ data: { workspaceId, name, targetAmount, deadline } });
  res.status(201).json(await getGoal(goal.id, workspaceId));
});

goalsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const found = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!found) return res.status(404).json({ error: "Goal not found" });

  const data: { name?: string; targetAmount?: number; deadline?: Date | null } = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "name (2 to 60 characters) is required" });
    const clash = await prisma.savingsGoal.findFirst({ where: { workspaceId, id: { not: found.id }, name: { equals: name, mode: "insensitive" } } });
    if (clash) return res.status(409).json({ error: "Já existe uma meta com esse nome." });
    data.name = name;
  }
  if (req.body?.targetAmount !== undefined) {
    const t = req.body.targetAmount;
    if (typeof t !== "number" || !(t > 0) || t > MAX_TARGET) return res.status(400).json({ error: "targetAmount must be a positive number" });
    data.targetAmount = t;
  }
  if (req.body?.deadline !== undefined) {
    const deadline = parseDeadline(req.body.deadline);
    if (deadline === undefined) return res.status(400).json({ error: "deadline must be YYYY-MM-DD" });
    data.deadline = deadline;
  }
  await prisma.savingsGoal.update({ where: { id: found.id }, data });
  res.json(await getGoal(found.id, workspaceId));
});

// Anyone in the workspace can put money in or take it out; the goal's terms stay with the admin.
goalsRouter.post("/:id/contributions", async (req, res) => {
  const { workspaceId, sub } = req.auth!;
  const amount = req.body?.amount;
  if (typeof amount !== "number") return res.status(400).json({ error: "amount must be a number" });

  const result = await addContribution(req.params.id, workspaceId, sub, amount, req.body?.note);
  if (!result.ok) {
    if (result.reason === "not_found") return res.status(404).json({ error: "Goal not found" });
    if (result.reason === "insufficient") return res.status(409).json({ error: "insufficient", saved: result.saved });
    return res.status(400).json({ error: "invalid_amount" });
  }
  res.status(201).json({ goal: result.goal, justCompleted: result.justCompleted });
});

goalsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await prisma.savingsGoal.deleteMany({ where: { id: req.params.id, workspaceId: req.auth!.workspaceId } });
  if (result.count === 0) return res.status(404).json({ error: "Goal not found" });
  res.json({ removed: true });
});
