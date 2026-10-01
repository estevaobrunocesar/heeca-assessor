import { Router } from "express";
import { login } from "../auth/service";

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
