import "dotenv/config";
import express from "express";
import { handleIncomingWhatsapp } from "./gateway/whatsapp";
import { dashboardRouter } from "./routes/dashboard";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.post("/webhook/whatsapp", handleIncomingWhatsapp);
app.use("/api/dashboard", dashboardRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 3001;
app.listen(port, () => console.log(`API listening on :${port}`));
