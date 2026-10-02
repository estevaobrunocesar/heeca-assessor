import { Router } from "express";
import { prisma } from "../db/client";
import { getReportData, reportFilename, resolvePeriod } from "../reports/data";
import { buildPdf } from "../reports/pdf";
import { buildXlsx } from "../reports/xlsx";
import { PDF_TYPE, XLSX_TYPE } from "../reports/store";

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
