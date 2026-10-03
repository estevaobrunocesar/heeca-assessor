import { Router } from "express";
import { detectRepeatedSpending } from "../financial/repeats";
import { todayInBrazil } from "../financial/invoices";
import { getFinanceAnalysis } from "../financial/bottlenecks";

export const insightsRouter = Router();

insightsRouter.get("/repeated", async (req, res) => {
  res.json(await detectRepeatedSpending(req.auth!.workspaceId, todayInBrazil()));
});

// Points of attention for the month so far, computed only from the registered entries.
insightsRouter.get("/bottlenecks", async (req, res) => {
  res.json(await getFinanceAnalysis(req.auth!.workspaceId, todayInBrazil()));
});
