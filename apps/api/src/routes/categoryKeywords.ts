import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { categoryLabel } from "../financial/categories";
import { saveKeyword } from "../financial/keywords";

export const categoryKeywordsRouter = Router();

categoryKeywordsRouter.get("/", async (req, res) => {
  const rules = await prisma.categoryKeyword.findMany({
    where: { workspaceId: req.auth!.workspaceId },
    include: { category: { include: { parent: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    await Promise.all(
      rules.map(async (r) => ({
        id: r.id,
        keyword: r.keyword,
        source: r.source,
        category: await categoryLabel(r.category),
      })),
    ),
  );
});

categoryKeywordsRouter.post("/", requireAdmin, async (req, res) => {
  const { keyword, categoryId } = req.body as { keyword?: string; categoryId?: string };
  if (!keyword?.trim() || !categoryId) return res.status(400).json({ error: "keyword and categoryId are required" });

  const workspaceId = req.auth!.workspaceId;
  const category = await prisma.category.findFirst({ where: { id: categoryId, workspaceId } });
  if (!category) return res.status(404).json({ error: "Category not found" });

  const saved = await saveKeyword(workspaceId, keyword, category.id, "MANUAL");
  if (!saved) {
    return res.status(400).json({ error: "Palavra muito curta ou genérica para virar regra (use ao menos 3 letras, ex: o nome da loja)." });
  }
  res.status(201).json({ keyword: saved });
});

categoryKeywordsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await prisma.categoryKeyword.deleteMany({ where: { id: req.params.id, workspaceId: req.auth!.workspaceId } });
  if (result.count === 0) return res.status(404).json({ error: "Rule not found" });
  res.json({ removed: true });
});
