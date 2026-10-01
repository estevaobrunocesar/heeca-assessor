import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { hashPassword } from "../auth/service";
import { normalizePhone } from "../users/service";
import type { UserRole } from "@prisma/client";

export const usersRouter = Router();

usersRouter.get("/", requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
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
  const { name, whatsappPhone, password, role, email } = req.body as {
    name?: string;
    whatsappPhone?: string;
    password?: string;
    role?: UserRole;
    email?: string;
  };
  if (!name || !whatsappPhone || !password) {
    return res.status(400).json({ error: "name, whatsappPhone and password are required" });
  }

  const user = await prisma.user.create({
    data: {
      name,
      whatsappPhone: normalizePhone(whatsappPhone),
      passwordHash: await hashPassword(password),
      role: role ?? "USER",
      email,
    },
  });

  res.status(201).json({ id: user.id, name: user.name, whatsappPhone: user.whatsappPhone, role: user.role });
});

usersRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name, status, role, password } = req.body as {
    name?: string;
    status?: "ACTIVE" | "INACTIVE";
    role?: UserRole;
    password?: string;
  };

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      name,
      status,
      role,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });

  res.json({ id: user.id, name: user.name, status: user.status, role: user.role });
});
