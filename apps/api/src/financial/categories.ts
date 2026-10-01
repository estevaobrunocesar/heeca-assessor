import { prisma } from "../db/client";
import type { TransactionType } from "@prisma/client";

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents so "Alimentacao" matches "Alimentação"
}

export async function resolveCategory(name: string | null, type: TransactionType, workspaceId: string) {
  if (!name) return null;

  const candidates = await prisma.category.findMany({ where: { type, workspaceId } });
  const needle = normalize(name);
  const existing = candidates.find((c) => normalize(c.name) === needle);
  if (existing) return existing;

  return prisma.category.create({ data: { name, type, workspaceId } });
}
