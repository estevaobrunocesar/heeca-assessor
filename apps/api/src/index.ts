import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import { handleIncomingWhatsapp } from "./gateway/whatsapp";
import { verifyTwilioSignature } from "./gateway/twilioAuth";
import { dashboardRouter } from "./routes/dashboard";
import { transactionsRouter } from "./routes/transactions";
import { categoriesRouter } from "./routes/categories";
import { usersRouter } from "./routes/users";
import { accountsRouter } from "./routes/accounts";
import { budgetsRouter } from "./routes/budgets";
import { recurringRouter } from "./routes/recurring";
import { invoicesRouter } from "./routes/invoices";
import { billsRouter } from "./routes/bills";
import { categoryKeywordsRouter } from "./routes/categoryKeywords";
import { reportsRouter } from "./routes/reports";
import { getTemporaryFile } from "./reports/store";
import { workspaceRouter } from "./routes/workspace";
import { authRouter } from "./routes/auth";
import { requireAuth } from "./auth/middleware";
import { generateDueRecurringTransactions } from "./financial/generateRecurring";

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

const app = express();
app.set("trust proxy", 1); // behind Traefik — needed for express-rate-limit to see the real client IP
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30, // generous for normal use, blocks scripted abuse of a single number
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // per IP, across login/forgot-password — slows down brute-forcing
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/webhook/whatsapp", webhookLimiter, verifyTwilioSignature, handleIncomingWhatsapp);
app.get("/health", (_req, res) => res.json({ ok: true }));

// Public on purpose: Twilio fetches WhatsApp attachments without credentials.
// Access is the unguessable, short-lived token in the path (see reports/store).
app.get("/reports/:token/:filename", webhookLimiter, (req, res) => {
  const file = /^[a-f0-9]{48}$/.test(req.params.token) ? getTemporaryFile(req.params.token) : undefined;
  if (!file) return res.status(404).send("Not found");
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(file.buffer);
});
app.use("/api/auth", authLimiter, authRouter);

app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/accounts", requireAuth, accountsRouter);
app.use("/api/budgets", requireAuth, budgetsRouter);
app.use("/api/recurring", requireAuth, recurringRouter);
app.use("/api/invoices", requireAuth, invoicesRouter);
app.use("/api/bills", requireAuth, billsRouter);
app.use("/api/category-keywords", requireAuth, categoryKeywordsRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/workspace", requireAuth, workspaceRouter);

const port = process.env.PORT ?? 3001;
app.listen(port, () => console.log(`API listening on :${port}`));

// Daily at 07:00 server time — generates any recurring transactions due today.
cron.schedule("0 7 * * *", async () => {
  try {
    const count = await generateDueRecurringTransactions();
    if (count > 0) console.log(`Generated ${count} recurring transaction(s).`);
  } catch (err) {
    console.error("Error generating recurring transactions:", err);
  }
});
