import { Router } from "express";
import { login } from "../auth/service";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../db/client";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const result = await login(email, password);
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
