import { Router } from "express";
import { getForecast } from "../financial/forecast";

export const forecastRouter = Router();

// Projected balance of the cash accounts for the next 30, 60 or 90 days.
forecastRouter.get("/", async (req, res) => {
  const requested = Number(req.query.days);
  const days = [30, 60, 90].includes(requested) ? requested : 60;
  res.json(await getForecast(req.auth!.workspaceId, days));
});
