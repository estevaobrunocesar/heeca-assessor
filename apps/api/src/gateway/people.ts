import { endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "../db/client";
import { listPeople, relationLabel } from "../financial/people";
import { todayInBrazil } from "../financial/invoices";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export const PEOPLE_LIST_RE = /\b(?:quais|minhas|lista(?:r)?|mostra(?:r)?)\s+(?:de\s+)?pessoas\b|pessoas cadastradas/i;

export async function answerPeopleList(user: { workspaceId: string }): Promise<string> {
  const people = await listPeople(user.workspaceId);
  if (people.length === 0) {
    return 'Você ainda não tem pessoas cadastradas. Quando registrar um gasto citando alguém, como "presente pra Marília 120", eu cadastro sozinho.';
  }

  const today = todayInBrazil();
  const sums = await prisma.transaction.groupBy({
    by: ["personId"],
    where: {
      workspaceId: user.workspaceId,
      status: "CONFIRMED",
      type: "EXPENSE",
      personId: { in: people.map((p) => p.id) },
      date: { gte: startOfMonth(today), lte: endOfMonth(today) },
    },
    _sum: { amount: true },
    _count: true,
  });
  const byId = new Map(sums.map((s) => [s.personId, s]));

  const lines = ["👤 Suas pessoas (gastos deste mês)"];
  for (const p of people) {
    const s = byId.get(p.id);
    const spent = s ? `${brl(Number(s._sum.amount ?? 0))} (${s._count} lançamento${s._count === 1 ? "" : "s"})` : "nada neste mês";
    const relation = relationLabel(p.relation);
    // "Mãe (mãe)" says nothing twice.
    const shown = relation && relation.toLowerCase() !== p.name.toLowerCase() ? ` (${relation})` : "";
    lines.push(`• ${p.name}${shown} — ${spent}`);
  }
  return lines.join("\n");
}
