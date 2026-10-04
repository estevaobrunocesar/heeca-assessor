import { getForecast } from "../financial/forecast";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// "previsão de caixa", "como vai ficar meu saldo", "vou ficar no vermelho?", "fluxo de caixa".
export const FORECAST_RE =
  /\b(?:previs[aã]o\s+(?:de\s+)?(?:caixa|saldo|fluxo)|fluxo\s+de\s+caixa|como\s+vai\s+ficar\s+(?:o\s+)?meu\s+saldo|vou\s+ficar\s+(?:no\s+vermelho|sem\s+dinheiro|negativ[oa]))\b/i;

/** "previsão" answers for the next 30 days; the page shows 30, 60 and 90. */
export async function answerForecast(user: { workspaceId: string }): Promise<string> {
  const f = await getForecast(user.workspaceId, 30);
  const lines = [`🔮 Previsão para os próximos 30 dias`, `Saldo das contas hoje: ${brl(f.startBalance)}`];

  const upcoming = f.events.slice(0, 5);
  if (upcoming.length) {
    lines.push("", "Próximos movimentos já conhecidos:");
    for (const e of upcoming) lines.push(`• ${dm(e.date)} ${e.label} — ${e.amount < 0 ? "-" : "+"}${brl(Math.abs(e.amount))}`);
  } else {
    lines.push("", "Não há contas a pagar nem recorrências nos próximos 30 dias.");
  }

  lines.push("", `Já planejado: entram ${brl(f.plannedIn)} e saem ${brl(f.plannedOut)}.`);
  if (f.dailyVariable > 0) lines.push(`Gastos do dia a dia (média dos últimos 90 dias): cerca de ${brl(f.dailyVariable)} por dia, ${brl(f.variableOut)} no período.`);
  lines.push(`Saldo estimado em ${dm(f.points[f.points.length - 1].date)}: ${brl(f.endBalance)}`);

  if (f.firstNegative) lines.push("", `🚨 O saldo deve ficar negativo a partir de ${dm(f.firstNegative)} (o ponto mais baixo é ${brl(f.lowest.balance)} em ${dm(f.lowest.date)}).`);
  else lines.push("", `✅ O saldo não fica negativo no período (o ponto mais baixo é ${brl(f.lowest.balance)} em ${dm(f.lowest.date)}).`);
  lines.push("É uma estimativa: não inclui receitas que ainda não estejam cadastradas.");
  return lines.join("\n");
}
