import { Router } from "express";
import { endOfDay, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { findPerson, listPeople, relationLabel } from "../financial/people";
import { todayInBrazil } from "../financial/invoices";
import { periodLabel, resolvePeriod } from "../reports/data";

export const peopleRouter = Router();

// Each person with what was spent on them this month, for the Pessoas screen.
peopleRouter.get("/", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const people = await listPeople(workspaceId);
  const today = todayInBrazil();

  const [month, all] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["personId"],
      where: {
        workspaceId,
        status: "CONFIRMED",
        type: "EXPENSE",
        personId: { not: null },
        date: { gte: startOfMonth(today), lte: endOfMonth(today) },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ["personId"],
      where: { workspaceId, status: "CONFIRMED", personId: { not: null } },
      _count: true,
    }),
  ]);
  const monthById = new Map(month.map((m) => [m.personId, m]));
  const allById = new Map(all.map((m) => [m.personId, m]));

  res.json(
    people.map((p) => ({
      id: p.id,
      name: p.name,
      relation: relationLabel(p.relation),
      monthTotal: Number(monthById.get(p.id)?._sum.amount ?? 0),
      monthCount: monthById.get(p.id)?._count ?? 0,
      totalCount: allById.get(p.id)?._count ?? 0,
    })),
  );
});

peopleRouter.post("/", requireAdmin, async (req, res) => {
  const { name, relation } = req.body as { name?: string; relation?: string };
  const cleaned = name?.trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 40) {
    return res.status(400).json({ error: "name (2 to 40 characters) is required" });
  }
  const workspaceId = req.auth!.workspaceId;
  if (await findPerson(cleaned, workspaceId)) return res.status(409).json({ error: "Já existe uma pessoa com esse nome." });

  const person = await prisma.person.create({
    data: { workspaceId, name: cleaned, relation: relation?.trim() || null },
  });
  res.status(201).json(person);
});

peopleRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name, relation } = req.body as { name?: string; relation?: string | null };
  const workspaceId = req.auth!.workspaceId;
  const current = await prisma.person.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!current) return res.status(404).json({ error: "Person not found" });

  const newName = name?.trim();
  if (newName !== undefined) {
    if (newName.length < 2 || newName.length > 40) return res.status(400).json({ error: "name must have 2 to 40 characters" });
    const other = await findPerson(newName, workspaceId);
    if (other && other.id !== current.id) return res.status(409).json({ error: "Já existe uma pessoa com esse nome." });
  }

  const person = await prisma.person.update({
    where: { id: current.id },
    data: {
      ...(newName !== undefined ? { name: newName } : {}),
      ...(relation !== undefined ? { relation: relation?.trim() || null } : {}),
    },
  });
  res.json(person);
});

// The person's entries stay; they just stop being attributed to anyone.
peopleRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await prisma.person.deleteMany({ where: { id: req.params.id, workspaceId: req.auth!.workspaceId } });
  if (result.count === 0) return res.status(404).json({ error: "Person not found" });
  res.json({ removed: true });
});

/**
 * Everything about one person over a period: totals, their share of all spending,
 * spending by category, the last six months and the latest entries. Scoped to the workspace.
 */
peopleRouter.get("/:id/dashboard", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const person = await prisma.person.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!person) return res.status(404).json({ error: "Person not found" });

  const today = todayInBrazil();
  const { from, to } = resolvePeriod(req.query as { from?: string; to?: string; preset?: string }, today);
  const inPeriod = { gte: from, lte: endOfDay(to) };

  const [rows, allExpense, trendRows] = await Promise.all([
    prisma.transaction.findMany({
      where: { workspaceId, personId: person.id, status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] }, date: inPeriod },
      include: { category: { include: { parent: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.transaction.aggregate({
      where: { workspaceId, status: "CONFIRMED", type: "EXPENSE", date: inPeriod },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        workspaceId,
        personId: person.id,
        status: "CONFIRMED",
        type: { in: ["INCOME", "EXPENSE"] },
        date: { gte: startOfMonth(subMonths(today, 5)) },
      },
      select: { date: true, type: true, amount: true },
    }),
  ]);

  const expenses = rows.filter((r) => r.type === "EXPENSE");
  const expense = expenses.reduce((sum, r) => sum + Number(r.amount), 0);
  const income = rows.filter((r) => r.type === "INCOME").reduce((sum, r) => sum + Number(r.amount), 0);
  const everyone = Number(allExpense._sum.amount ?? 0);

  const byCategory = new Map<string, number>();
  for (const r of expenses) {
    const name = r.category?.parent?.name ?? r.category?.name ?? "Sem categoria";
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(r.amount));
  }

  const trend = new Map<string, { income: number; expense: number }>();
  for (let i = 5; i >= 0; i--) trend.set(format(startOfMonth(subMonths(today, i)), "yyyy-MM"), { income: 0, expense: 0 });
  for (const t of trendRows) {
    const bucket = trend.get(format(startOfMonth(t.date), "yyyy-MM"));
    if (!bucket) continue;
    if (t.type === "INCOME") bucket.income += Number(t.amount);
    else bucket.expense += Number(t.amount);
  }

  const biggest = expenses.reduce<(typeof expenses)[number] | null>((max, r) => (!max || Number(r.amount) > Number(max.amount) ? r : max), null);

  res.json({
    person: { id: person.id, name: person.name, relation: relationLabel(person.relation) },
    period: { from, to, label: periodLabel(from, to) },
    expense,
    income,
    count: rows.length,
    shareOfExpense: everyone > 0 ? (expense / everyone) * 100 : 0,
    biggest: biggest ? { description: biggest.description, amount: Number(biggest.amount), date: biggest.date } : null,
    byCategory: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({ name, total, percent: expense > 0 ? (total / expense) * 100 : 0 })),
    trend: [...trend.entries()].map(([month, v]) => ({ month, ...v })),
    recent: rows.slice(0, 30).map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      category: r.category ? (r.category.parent ? r.category.parent.name + " > " + r.category.name : r.category.name) : null,
      type: r.type,
      amount: Number(r.amount),
    })),
  });
});
