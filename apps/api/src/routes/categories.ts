import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import type { TransactionType } from "@prisma/client";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    include: { children: true },
    where: { parentId: null },
    orderBy: { name: "asc" },
  });
  res.json(categories);
});

categoriesRouter.post("/", requireAdmin, async (req, res) => {
  const { name, type, parentId } = req.body as { name?: string; type?: TransactionType; parentId?: string | null };
  if (!name || !type) {
    return res.status(400).json({ error: "name and type are required" });
  }
  const category = await prisma.category.create({ data: { name, type, parentId: parentId ?? null } });
  res.status(201).json(category);
});

categoriesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name } = req.body as { name?: string };
  const category = await prisma.category.update({ where: { id: req.params.id }, data: { name } });
  res.json(category);
});

categoriesRouter.delete("/:id", requireAdmin, async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
