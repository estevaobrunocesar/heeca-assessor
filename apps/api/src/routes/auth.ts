import { Router } from "express";
import { login } from "../auth/service";
import { beginMfaSetup, completeMfaLogin, disableMfa, enableMfa, mfaStatus } from "../auth/mfaService";
import { requireAuth } from "../auth/middleware";
import { createPasswordResetToken, consumePasswordResetToken } from "../auth/passwordReset";
import { sendPasswordResetEmail, isEmailConfigured } from "../email/resend";
import { normalizePhone } from "../users/service";
import { prisma } from "../db/client";

const PHONE_RE = /^\+\d{8,15}$/;

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

  // Right password, but MFA is on: no session yet, only a short-lived challenge to answer with a code.
  if (result.kind === "mfa") return res.json({ mfaRequired: true, mfaToken: result.mfaToken });

  res.json({ token: result.token, user: result.user });
});

authRouter.post("/mfa/verify", async (req, res) => {
  const { mfaToken, code } = req.body as { mfaToken?: string; code?: string };
  if (!mfaToken || !code) return res.status(400).json({ error: "mfaToken and code are required" });

  const result = await completeMfaLogin(mfaToken, code);
  if (result.ok) return res.json({ token: result.token, user: result.user, recoveryCodesLeft: result.recoveryCodesLeft });

  if (result.reason === "expired") return res.status(401).json({ error: "expired" });
  if (result.reason === "locked") return res.status(429).json({ error: "locked", retryAfterMinutes: result.retryAfterMinutes });
  res.status(401).json({ error: "invalid" });
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
    select: { id: true, name: true, role: true, whatsappPhone: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

authRouter.get("/mfa/status", requireAuth, async (req, res) => {
  res.json(await mfaStatus(req.auth!.sub));
});

authRouter.post("/mfa/setup", requireAuth, async (req, res) => {
  const setup = await beginMfaSetup(req.auth!.sub);
  if (!setup) return res.status(409).json({ error: "already_enabled" });
  res.json(setup);
});

authRouter.post("/mfa/enable", requireAuth, async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: "code is required" });

  const recoveryCodes = await enableMfa(req.auth!.sub, code);
  if (!recoveryCodes) return res.status(400).json({ error: "invalid" });
  res.json({ recoveryCodes });
});

authRouter.post("/mfa/disable", requireAuth, async (req, res) => {
  const { password, code } = req.body as { password?: string; code?: string };
  if (!password || !code) return res.status(400).json({ error: "password and code are required" });

  const result = await disableMfa(req.auth!.sub, password, code);
  if (result.ok) return res.json({ disabled: true });
  if (result.reason === "locked") return res.status(429).json({ error: "locked", retryAfterMinutes: result.retryAfterMinutes });
  res.status(401).json({ error: result.reason });
});

// Links the WhatsApp number the user talks to the Assessor from to their own
// account. Asked right after login when whatsappPhone is still unset — until
// then, messages from that number have no user to resolve to and are
// discarded by the webhook before any AI call is made.
authRouter.post("/phone", requireAuth, async (req, res) => {
  const { whatsappPhone } = req.body as { whatsappPhone?: string };
  if (!whatsappPhone) return res.status(400).json({ error: "whatsappPhone is required" });

  const phone = normalizePhone(whatsappPhone);
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: "Use o formato internacional, ex: +5511999998888" });
  }

  const existing = await prisma.user.findUnique({ where: { whatsappPhone: phone } });
  if (existing && existing.id !== req.auth!.sub) {
    return res.status(409).json({ error: "Esse número já está vinculado a outro usuário." });
  }

  const user = await prisma.user.update({
    where: { id: req.auth!.sub },
    data: { whatsappPhone: phone },
    select: { id: true, name: true, role: true, whatsappPhone: true },
  });
  res.json(user);
});
