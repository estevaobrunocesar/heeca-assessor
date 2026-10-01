import { subDays, previousDay, startOfDay, type Day } from "date-fns";

const WEEKDAYS: Record<string, Day> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  "terça": 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  "sábado": 6,
};

/**
 * Resolves the AI's free-text "data_relativa" (e.g. "ontem", "sabado passado")
 * into an actual Date, anchored to when the WhatsApp message was received —
 * not when it's processed — so a slow queue never shifts "hoje" to tomorrow.
 */
export function resolveDate(dataRelativa: string, receivedAt: Date): Date {
  const text = dataRelativa.trim().toLowerCase();
  const today = startOfDay(receivedAt);

  if (text === "hoje" || text === "") return today;
  if (text === "ontem") return subDays(today, 1);
  if (text === "anteontem") return subDays(today, 2);

  const isoMatch = text.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoMatch) return startOfDay(new Date(text));

  for (const [name, dayIndex] of Object.entries(WEEKDAYS)) {
    if (text.includes(name)) {
      return previousDay(today, dayIndex);
    }
  }

  return today;
}
