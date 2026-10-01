import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import type { TransactionType } from "@prisma/client";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (req, res) => {
  const categories = await prisma.category.findMany({
    include: { children: true },
    where: { parentId: null, workspaceId: req.auth!.workspaceId },
    orderBy: { name: "asc" },
  });
  res.json(categories);
});

categoriesRouter.post("/", requireAdmin, async (req, res) => {
  const { name, type, parentId } = req.body as { name?: string; type?: TransactionType; parentId?: string | null };
  if (!name || !type) {
    return res.status(400).json({ error: "name and type are required" });
  }
  const category = await prisma.category.create({
    data: { name, type, parentId: parentId ?? null, workspaceId: req.auth!.workspaceId },
  });
  res.status(201).json(category);
});

categoriesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name } = req.body as { name?: string };
  const result = await prisma.category.updateMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
    data: { name },
  });
  if (result.count === 0) return res.status(404).json({ error: "Category not found" });
  res.json({ ok: true });
});

categoriesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await prisma.category.deleteMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  if (result.count === 0) return res.status(404).json({ error: "Category not found" });
  res.status(204).send();
});
