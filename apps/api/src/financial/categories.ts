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

/**
 * Lookup-only counterpart of resolveCategory, for queries: never creates
 * anything. Returns the ids to filter transactions by — a subcategory alone,
 * or a top-level category together with all its subcategories — plus
 * whether the scope is a parent (so a report can break it down by
 * subcategory). Null when nothing in the workspace matches.
 */
export async function findCategoryScope(categoria: string | null, subcategoria: string | null, workspaceId: string) {
  if (!categoria && !subcategoria) return null;

  const all = await prisma.category.findMany({ where: { workspaceId } });
  const byId = new Map(all.map((c) => [c.id, c]));
  const catNeedle = categoria ? normalize(categoria) : null;
  const subNeedle = subcategoria ? normalize(subcategoria) : null;

  if (subNeedle) {
    const subs = all.filter((c) => c.parentId && normalize(c.name) === subNeedle);
    const sub =
      subs.find((c) => catNeedle && normalize(byId.get(c.parentId!)?.name ?? "") === catNeedle) ?? subs[0];
    if (sub) return { ids: [sub.id], label: sub.name, isParent: false };
  }

  // The AI sometimes puts the specific item (e.g. "Combustível") in `categoria`.
  const needle = catNeedle ?? subNeedle!;
  const parent = all.find((c) => !c.parentId && normalize(c.name) === needle);
  if (parent) {
    const childIds = all.filter((c) => c.parentId === parent.id).map((c) => c.id);
    return { ids: [parent.id, ...childIds], label: parent.name, isParent: true };
  }
  const asSub = all.find((c) => c.parentId && normalize(c.name) === needle);
  if (asSub) return { ids: [asSub.id], label: asSub.name, isParent: false };

  return null;
}

/**
 * Lookup-only: the category with exactly this name (and parent name, when
 * given) in the workspace, or null. Used by keyword rules, which must never
 * create categories.
 */
export async function findCategoryByNames(
  categoria: string,
  subcategoria: string | null,
  workspaceId: string,
  type?: TransactionType,
) {
  const all = await prisma.category.findMany({
    where: { workspaceId, ...(type ? { type } : {}) },
    include: { parent: true },
  });
  const catNeedle = normalize(categoria);

  if (subcategoria) {
    const subNeedle = normalize(subcategoria);
    return all.find((c) => c.parent && normalize(c.name) === subNeedle && normalize(c.parent.name) === catNeedle) ?? null;
  }
  return all.find((c) => !c.parent && normalize(c.name) === catNeedle) ?? null;
}

/**
 * For a category the user named on its own ("muda a categoria para
 * Delivery"): a top-level category if one has that name, otherwise a
 * subcategory with it anywhere. Only creates a new top-level category when
 * the name exists nowhere — resolveCategory(name, null) would have created
 * a loose duplicate top-level "Delivery" next to Alimentação > Delivery.
 */
export async function resolveCategoryByName(name: string, type: TransactionType, workspaceId: string) {
  // "Alimentação > Mercado": parent and child named together.
  const parts = name.split(/\s*[>/]\s*/).filter(Boolean);
  if (parts.length === 2) {
    const exact = await findCategoryByNames(parts[0], parts[1], workspaceId, type);
    if (exact) return exact;
  }

  const all = await prisma.category.findMany({ where: { workspaceId, type }, include: { parent: true } });
  const needle = normalize(name);

  const topLevel = all.find((c) => !c.parentId && normalize(c.name) === needle);
  if (topLevel) return topLevel;
  const sub = all.find((c) => c.parentId && normalize(c.name) === needle);
  if (sub) return sub;

  const created = await prisma.category.create({ data: { name: name.trim(), type, workspaceId }, include: { parent: true } });
  return created;
}

/** "Parent > Child" for a subcategory, just the name for a top-level one. */
export async function categoryLabel(
  category: { name: string; parentId?: string | null; parent?: { name: string } | null } | null,
): Promise<string | null> {
  if (!category) return null;
  if (category.parent) return `${category.parent.name} > ${category.name}`;
  if (category.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: category.parentId } });
    if (parent) return `${parent.name} > ${category.name}`;
  }
  return category.name;
}

/** The ids a report should filter by for one category: itself if it is a subcategory, or itself plus its subcategories. */
export async function scopeOfCategory(category: { id: string; name: string; parent?: { name: string } | null }) {
  if (category.parent) return { ids: [category.id], label: category.name, isParent: false };
  const children = await prisma.category.findMany({ where: { parentId: category.id }, select: { id: true } });
  return { ids: [category.id, ...children.map((c) => c.id)], label: category.name, isParent: true };
}
