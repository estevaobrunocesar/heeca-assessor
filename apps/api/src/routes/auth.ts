import { Router } from "express";
import { login } from "../auth/service";
import { requireAuth } from "../auth/middleware";
import { createPasswordResetToken, consumePasswordResetToken } from "../auth/passwordReset";
import { sendPasswordResetEmail, isEmailConfigured } from "../email/resend";
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

authRouter.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: "email is required" });

  // Always respond the same way regardless of whether the e-mail exists,
  // so this endpoint can't be used to probe which addresses are registered.
  const genericResponse = { message: "Se esse e-mail estiver cadastrado, enviamos um link de redefinição." };

  if (!isEmailConfigured()) {
    return res.status(503).json({ error: "O envio de e-mail ainda não foi configurado neste servidor." });
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const resetUrl = `${process.env.WEB_URL}/redefinir-senha?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }

  res.json(genericResponse);
});

authRouter.post("/reset-password", async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) return res.status(400).json({ error: "token and password are required" });
  if (password.length < 6) return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });

  const ok = await consumePasswordResetToken(token, password);
  if (!ok) return res.status(400).json({ error: "Link inválido ou expirado. Peça um novo." });

  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.sub },
    select: { id: true, name: true, role: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});
