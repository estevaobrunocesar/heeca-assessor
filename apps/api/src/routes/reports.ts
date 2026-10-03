import { Router } from "express";
import { prisma } from "../db/client";
import { getReportData, reportFilename, resolvePeriod } from "../reports/data";
import { buildPdf } from "../reports/pdf";
import { buildXlsx } from "../reports/xlsx";
import { PDF_TYPE, XLSX_TYPE } from "../reports/store";
import { lastClosedPeriod, sendReportTo, type Frequency } from "../reports/emailReport";
import { isEmailConfigured } from "../email/resend";
import { lastClosedWeek } from "../financial/weeklySummary";

export const reportsRouter = Router();

type PeriodQuery = { from?: string; to?: string; preset?: string; format?: string };

// The same numbers the files contain, for the Relatórios screen to preview.
reportsRouter.get("/data", async (req, res) => {
  const { from, to } = resolvePeriod(req.query as PeriodQuery);
  res.json(await getReportData(req.auth!.workspaceId, from, to));
});

reportsRouter.get("/file", async (req, res) => {
  const query = req.query as PeriodQuery;
  const kind = query.format === "xlsx" ? "xlsx" : "pdf";
  const { from, to } = resolvePeriod(query);
  const workspaceId = req.auth!.workspaceId;

  const [data, workspace] = await Promise.all([
    getReportData(workspaceId, from, to),
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
  ]);
  const buffer = kind === "pdf" ? await buildPdf(data, workspace.name) : await buildXlsx(data, workspace.name);

  res.setHeader("Content-Type", kind === "pdf" ? PDF_TYPE : XLSX_TYPE);
  res.setHeader("Content-Disposition", `attachment; filename="${reportFilename(data, kind)}"`);
  res.send(buffer);
});

// Opt-in periodic report by e-mail, per person (off by default).
reportsRouter.get("/email", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: { reportEmailFrequency: true, email: true } });
  res.json({ frequency: user.reportEmailFrequency, email: user.email, emailConfigured: isEmailConfigured() });
});

reportsRouter.put("/email", async (req, res) => {
  const frequency = req.body?.frequency;
  if (!["NONE", "WEEKLY", "MONTHLY"].includes(frequency)) return res.status(400).json({ error: "invalid_frequency" });

  const current = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: { reportEmailFrequency: true } });
  if (current.reportEmailFrequency === frequency) return res.json({ frequency });

  // Start counting from now: the latest closed period is treated as already sent, so turning
  // this on does not immediately mail an old report.
  const reportEmailLastKey = frequency === "NONE" ? null : lastClosedPeriod(frequency as Frequency).key;
  await prisma.user.update({ where: { id: req.auth!.sub }, data: { reportEmailFrequency: frequency, reportEmailLastKey } });
  res.json({ frequency });
});

// Sends the latest closed period right now, to check that the e-mail arrives.
reportsRouter.post("/email/test", async (req, res) => {
  if (!isEmailConfigured()) return res.status(503).json({ error: "email_not_configured" });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.sub },
    select: { id: true, name: true, email: true, workspaceId: true, reportEmailFrequency: true },
  });
  const frequency = user.reportEmailFrequency === "WEEKLY" ? "WEEKLY" : "MONTHLY";
  try {
    await sendReportTo(user, lastClosedPeriod(frequency));
    res.json({ sent: true, email: user.email });
  } catch (err) {
    console.error("Test report e-mail failed:", err);
    res.status(502).json({ error: "send_failed" });
  }
});

// Weekly summary by WhatsApp: off until the person turns it on, and only possible with a linked number.
reportsRouter.get("/whatsapp-summary", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: { weeklyWhatsappSummary: true, whatsappPhone: true } });
  res.json({
    enabled: user.weeklyWhatsappSummary,
    phoneLinked: user.whatsappPhone !== null,
    templateConfigured: !!process.env.TWILIO_SUMMARY_TEMPLATE_SID,
  });
});

reportsRouter.put("/whatsapp-summary", async (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be true or false" });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: { whatsappPhone: true } });
  if (enabled && !user.whatsappPhone) return res.status(409).json({ error: "phone_not_linked" });

  // Turning it on starts counting from now: the closed week counts as already sent.
  await prisma.user.update({
    where: { id: req.auth!.sub },
    data: { weeklyWhatsappSummary: enabled, ...(enabled ? { weeklyWhatsappLastKey: lastClosedWeek().key } : {}) },
  });
  res.json({ enabled });
});
