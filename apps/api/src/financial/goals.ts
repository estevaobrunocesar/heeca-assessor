import { differenceInCalendarMonths, format } from "date-fns";
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
  daysLeft: number | null;
  /** Straight-line amount that should be saved by today to arrive on the deadline; null without a usable deadline. */
  expectedSoFar: number | null;
  /** Behind schedule: a month or more has passed and less than 80% of the expected amount is saved. */
  behind: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS_BEFORE_BEHIND = 30;
const BEHIND_TOLERANCE = 0.8;

const calendarDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Pure: the figures shown for a goal, given what has been saved so far. */
export function describeGoal(
  goal: { id: string; name: string; targetAmount: unknown; deadline: Date | null; createdAt?: Date },
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

  // Pace: compared with a straight line from the day the goal was created to its deadline.
  let expectedSoFar: number | null = null;
  let behind = false;
  const daysLeft = deadline ? Math.round((deadline.getTime() - today.getTime()) / DAY_MS) : null;
  if (!done && !overdue && deadline && goal.createdAt) {
    const created = calendarDay(goal.createdAt);
    const total = Math.round((deadline.getTime() - created.getTime()) / DAY_MS);
    const elapsed = Math.round((today.getTime() - created.getTime()) / DAY_MS);
    if (total > 0) {
      expectedSoFar = round2(target * Math.min(1, Math.max(0, elapsed / total)));
      behind = elapsed >= MIN_DAYS_BEFORE_BEHIND && saved < expectedSoFar * BEHIND_TOLERANCE;
    }
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
    daysLeft,
    expectedSoFar,
    behind,
  };
}

export type GoalAlertKind = "OVERDUE" | "NEAR" | "LATE";
const NEAR_DAYS = 7;
const LATE_REPEAT_DAYS = 7;

/**
 * Which alert (if any) a goal should raise now. One at a time, most serious first.
 * OVERDUE and NEAR are sent once per deadline; LATE repeats at most every 7 days.
 * `key` is stored on the goal so the daily job never repeats itself.
 */
export function pickGoalAlert(
  goal: GoalView,
  last: { key: string | null; at: Date | null },
  today: Date,
): { kind: GoalAlertKind; key: string } | null {
  if (goal.state === "CONCLUIDA" || !goal.deadline) return null;
  const day = format(goal.deadline, "yyyy-MM-dd");

  if (goal.state === "VENCIDA") {
    const key = `OVERDUE:${day}`;
    return last.key === key ? null : { kind: "OVERDUE", key };
  }
  if (goal.daysLeft !== null && goal.daysLeft <= NEAR_DAYS) {
    const key = `NEAR:${day}`;
    return last.key === key ? null : { kind: "NEAR", key };
  }
  if (goal.behind) {
    const daysSince = last.at ? Math.floor((today.getTime() - calendarDay(last.at).getTime()) / DAY_MS) : Infinity;
    return last.key === "LATE" && daysSince < LATE_REPEAT_DAYS ? null : { kind: "LATE", key: "LATE" };
  }
  return null;
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
