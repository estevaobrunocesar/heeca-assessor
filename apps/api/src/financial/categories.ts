import { prisma } from "../db/client";
import type { TransactionType } from "@prisma/client";

export async function resolveCategory(name: string | null, type: TransactionType) {
  if (!name) return null;

  const existing = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, type },
  });
  if (existing) return existing;

  return prisma.category.create({ data: { name, type } });
}
