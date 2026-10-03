import { Router } from "express";
import { endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { findPerson, listPeople, relationLabel } from "../financial/people";
import { todayInBrazil } from "../financial/invoices";

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
