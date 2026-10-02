import { Router } from "express";
import { detectRepeatedSpending } from "../financial/repeats";
import { todayInBrazil } from "../financial/invoices";

export const insightsRouter = Router();

insightsRouter.get("/repeated", async (req, res) => {
  res.json(await detectRepeatedSpending(req.auth!.workspaceId, todayInBrazil()));
});
