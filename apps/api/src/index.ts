import "dotenv/config";
import express from "express";
import { handleIncomingWhatsapp } from "./gateway/whatsapp";
import { dashboardRouter } from "./routes/dashboard";
import { transactionsRouter } from "./routes/transactions";
import { categoriesRouter } from "./routes/categories";
import { usersRouter } from "./routes/users";
import { accountsRouter } from "./routes/accounts";
import { authRouter } from "./routes/auth";
import { requireAuth } from "./auth/middleware";

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.post("/webhook/whatsapp", handleIncomingWhatsapp);
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);

app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/accounts", requireAuth, accountsRouter);

const port = process.env.PORT ?? 3001;
app.listen(port, () => console.log(`API listening on :${port}`));
