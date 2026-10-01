import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { hashPassword } from "../auth/service";
import { normalizePhone } from "../users/service";
import type { UserRole } from "@prisma/client";

export const usersRouter = Router();

usersRouter.get("/", requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    where: { workspaceId: req.auth!.workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      shortName: true,
      whatsappPhone: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });
  res.json(users);
});

usersRouter.post("/", requireAdmin, async (req, res) => {
  const { name, whatsappPhone, email, password, role } = req.body as {
    name?: string;
    whatsappPhone?: string;
    email?: string;
    password?: string;
    role?: UserRole;
  };
  if (!name || !whatsappPhone || !email || !password) {
    return res.status(400).json({ error: "name, whatsappPhone, email and password are required" });
  }

  const user = await prisma.user.create({
    data: {
      workspaceId: req.auth!.workspaceId,
      name,
      whatsappPhone: normalizePhone(whatsappPhone),
      email: email.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role: role ?? "USER",
    },
  });

  res.status(201).json({ id: user.id, name: user.name, whatsappPhone: user.whatsappPhone, email: user.email, role: user.role });
});

usersRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name, status, role, password } = req.body as {
    name?: string;
    status?: "ACTIVE" | "INACTIVE";
    role?: UserRole;
    password?: string;
  };

  const result = await prisma.user.updateMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
    data: {
      name,
      status,
      role,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  if (result.count === 0) return res.status(404).json({ error: "User not found" });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ id: user.id, name: user.name, status: user.status, role: user.role });
});
