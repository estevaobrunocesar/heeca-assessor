import { Router } from "express";
import { getMonthSummary, getMonthlyTrend } from "../financial/queries";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (req, res) => {
  const summary = await getMonthSummary(new Date(), req.auth!.workspaceId);
  res.json(summary);
});

dashboardRouter.get("/trend", async (req, res) => {
  const months = Math.min(Number(req.query.months) || 6, 24);
  const trend = await getMonthlyTrend(months, new Date(), req.auth!.workspaceId);
  res.json(trend);
});
