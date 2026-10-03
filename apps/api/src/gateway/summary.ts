import { prisma } from "../db/client";
import { formatSummaryMessage, getWeeklySummary, lastClosedWeek, lastSevenDays } from "../financial/weeklySummary";

// "resumo da semana", "resumo semanal", "como foi minha semana", "resumo da semana passada".
export const SUMMARY_RE = /\b(?:resumo\s+(?:d[ae]s?\s+|dessa\s+|desta\s+)?semana(?:\s+passada)?|resumo\s+semanal|como\s+foi\s+(?:a\s+)?minha\s+semana)\b/i;
const LAST_WEEK_RE = /semana\s+passada/i;

const ENABLE_RE = /\b(?:ativ(?:a|ar|e)|liga(?:r)?|quero\s+receber|manda(?:r)?)\b.*\bresumo\s+semanal\b/i;
const DISABLE_RE = /\b(?:desativ(?:a|ar|e)|desliga(?:r)?|para(?:r)?\s+(?:de\s+)?(?:mandar|enviar)|cancela(?:r)?|n[aã]o\s+quero)\b.*\bresumo\s+semanal\b/i;

/** Answers "resumo da semana" (last 7 days, or last closed week with "semana passada"), or turns the weekly message on/off. */
export async function handleSummary(text: string, user: { id: string; workspaceId: string }): Promise<string | null> {
  if (DISABLE_RE.test(text)) {
    await prisma.user.update({ where: { id: user.id }, data: { weeklyWhatsappSummary: false } });
    return "Pronto, desativei o resumo semanal automático. Quando quiser, é só pedir \"resumo da semana\".";
  }

  if (ENABLE_RE.test(text)) {
    // Setting the key to the closed week means the first message is the next one, not an old week.
    await prisma.user.update({
      where: { id: user.id },
      data: { weeklyWhatsappSummary: true, weeklyWhatsappLastKey: lastClosedWeek().key },
    });
    const lines = ["✅ Resumo semanal ativado. Toda segunda-feira de manhã eu te mando como foi a semana anterior."];
    // Without an approved template WhatsApp only lets us write first inside 24h of the last message.
    if (!process.env.TWILIO_SUMMARY_TEMPLATE_SID) {
      lines.push(
        "Aviso: o WhatsApp só me deixa escrever primeiro se você tiver falado comigo nas últimas 24 horas. Se isso não acontecer, o resumo não chega, e aí é só pedir \"resumo da semana\".",
      );
    }
    return lines.join("\n");
  }

  if (!SUMMARY_RE.test(text)) return null;

  const lastWeek = LAST_WEEK_RE.test(text);
  const period = lastWeek ? lastClosedWeek() : lastSevenDays();
  const summary = await getWeeklySummary(user.workspaceId, period);
  return formatSummaryMessage(summary, lastWeek ? "Resumo da semana passada" : "Resumo dos últimos 7 dias");
}
