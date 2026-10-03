import { differenceInCalendarMonths } from "date-fns";
import { prisma } from "../db/client";
import { todayInBrazil } from "./invoices";
import { normalizeText } from "./keywords";

export type GoalState = "CONCLUIDA" | "VENCIDA" | "COM_PRAZO" | "SEM_PRAZO";

export type GoalView = {
  id: string;
  name: string;
  target: number;
  saved: number;
  remaining: number;
  percent: number; // 0-100, capped
  deadline: Date | null;
  state: GoalState;
  /** What to set aside each month to arrive on the deadline (null without one, or when done/overdue). */
  monthlyNeeded: number | null;
  monthsLeft: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: the figures shown for a goal, given what has been saved so far. */
export function describeGoal(
  goal: { id: string; name: string; targetAmount: unknown; deadline: Date | null },
  saved: number,
  today: Date,
): GoalView {
  const target = Number(goal.targetAmount);
  // A @db.Date comes back as UTC midnight: read it as the calendar day it names, whatever the server timezone.
  const deadline = goal.deadline ? new Date(goal.deadline.getUTCFullYear(), goal.deadline.getUTCMonth(), goal.deadline.getUTCDate()) : null;
  const remaining = Math.max(0, round2(target - saved));
  const done = saved >= target;
  const overdue = !done && deadline !== null && deadline < today;

  let monthsLeft: number | null = null;
  let monthlyNeeded: number | null = null;
  if (!done && !overdue && deadline) {
    // The current month counts: a deadline in this month leaves one month to save.
    monthsLeft = Math.max(1, differenceInCalendarMonths(deadline, today) + 1);
    monthlyNeeded = round2(remaining / monthsLeft);
  }

  return {
    id: goal.id,
    name: goal.name,
    target,
    saved: round2(saved),
    remaining,
    percent: target > 0 ? Math.min(100, (saved / target) * 100) : 0,
    deadline,
    state: done ? "CONCLUIDA" : overdue ? "VENCIDA" : deadline ? "COM_PRAZO" : "SEM_PRAZO",
    monthlyNeeded,
    monthsLeft,
  };
}

export async function listGoals(workspaceId: string): Promise<GoalView[]> {
  const [goals, sums] = await Promise.all([
    prisma.savingsGoal.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.goalContribution.groupBy({ by: ["goalId"], where: { workspaceId }, _sum: { amount: true } }),
  ]);
  const savedById = new Map(sums.map((s) => [s.goalId, Number(s._sum.amount ?? 0)]));
  const today = todayInBrazil();
  return goals.map((g) => describeGoal(g, savedById.get(g.id) ?? 0, today));
}

export async function getGoal(goalId: string, workspaceId: string): Promise<GoalView | null> {
  const goal = await prisma.savingsGoal.findFirst({ where: { id: goalId, workspaceId } });
  if (!goal) return null;
  const sum = await prisma.goalContribution.aggregate({ where: { goalId, workspaceId }, _sum: { amount: true } });
  return describeGoal(goal, Number(sum._sum.amount ?? 0), todayInBrazil());
}

export type ContributionResult =
  | { ok: true; goal: GoalView; justCompleted: boolean }
  | { ok: false; reason: "not_found" | "invalid_amount" | "insufficient"; saved?: number };

/** Puts money into the goal (positive) or takes it out (negative); the total can never go below zero. */
export async function addContribution(
  goalId: string,
  workspaceId: string,
  userId: string,
  amount: number,
  note?: string | null,
): Promise<ContributionResult> {
  const value = round2(amount);
  if (!Number.isFinite(value) || value === 0 || Math.abs(value) > 10_000_000) return { ok: false, reason: "invalid_amount" };

  const before = await getGoal(goalId, workspaceId);
  if (!before) return { ok: false, reason: "not_found" };
  if (value < 0 && before.saved + value < 0) return { ok: false, reason: "insufficient", saved: before.saved };

  await prisma.goalContribution.create({
    data: { goalId, workspaceId, userId, amount: value, note: note?.trim().slice(0, 140) || null },
  });
  const goal = (await getGoal(goalId, workspaceId))!;
  return { ok: true, goal, justCompleted: before.state !== "CONCLUIDA" && goal.state === "CONCLUIDA" };
}

/** The goal a message refers to: its name contained in the text (or the text in the name); the longest name wins. */
export async function findGoalByMention(mention: string, workspaceId: string) {
  const wanted = normalizeText(mention);
  if (!wanted) return null;
  const goals = await prisma.savingsGoal.findMany({ where: { workspaceId } });
  const hits = goals
    .map((g) => ({ goal: g, name: normalizeText(g.name) }))
    .filter((g) => g.name && (` ${wanted} `.includes(` ${g.name} `) || ` ${g.name} `.includes(` ${wanted} `)))
    .sort((a, b) => b.name.length - a.name.length);
  return hits[0]?.goal ?? null;
}
