import { prisma } from "../db/client";
import type { TransactionType } from "@prisma/client";

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents so "Alimentacao" matches "Alimentação"
}

/**
 * Resolves the AI's categoria/subcategoria pair against the workspace's real
 * taxonomy. Tries, in order: the exact subcategory under the named parent
 * (the precise match, e.g. Transporte > Uber); the subcategory name alone
 * anywhere in the workspace (covers the AI naming the parent slightly
 * differently); then the top-level category alone. Only creates a new
 * top-level category as a last resort, so real messages are never dropped
 * even when they don't fit the curated list.
 */
export async function resolveCategory(
  categoria: string | null,
  subcategoria: string | null,
  type: TransactionType,
  workspaceId: string,
) {
  if (!categoria) return null;

  const candidates = await prisma.category.findMany({ where: { type, workspaceId } });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const categoriaNeedle = normalize(categoria);

  if (subcategoria) {
    const subNeedle = normalize(subcategoria);

    const exact = candidates.find((c) => {
      if (normalize(c.name) !== subNeedle || !c.parentId) return false;
      const parent = byId.get(c.parentId);
      return parent ? normalize(parent.name) === categoriaNeedle : false;
    });
    if (exact) return exact;

    const subAnywhere = candidates.find((c) => normalize(c.name) === subNeedle);
    if (subAnywhere) return subAnywhere;
  }

  const topLevel = candidates.find((c) => normalize(c.name) === categoriaNeedle && !c.parentId);
  if (topLevel) return topLevel;

  return prisma.category.create({ data: { name: categoria, type, workspaceId } });
}
