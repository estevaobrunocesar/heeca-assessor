import { Router } from "express";
import { login } from "../auth/service";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../db/client";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { whatsappPhone, password } = req.body as { whatsappPhone?: string; password?: string };
  if (!whatsappPhone || !password) {
    return res.status(400).json({ error: "whatsappPhone and password are required" });
  }

  const result = await login(whatsappPhone, password);
  if (!result) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json(result);
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.sub },
    select: { id: true, name: true, role: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});
