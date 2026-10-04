import { Router } from "express";
import { getBi } from "../financial/bi";
import { todayInBrazil } from "../financial/invoices";
import { resolvePeriod } from "../reports/data";

export const biRouter = Router();

// Everything the BI page draws. `preset`/`from`/`to` choose the period of the category, user and
// expense-split sections; the monthly series and the net-worth line always cover the last 12 months.
biRouter.get("/", async (req, res) => {
  const today = todayInBrazil();
  const period = resolvePeriod(req.query as { from?: string; to?: string; preset?: string }, today);
  res.json(await getBi(req.auth!.workspaceId, period, today));
});
