import { addContribution, findGoalByMention, listGoals, type GoalView } from "../financial/goals";
import { prisma } from "../db/client";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const dmy = (d: Date) => d.toLocaleDateString("pt-BR");

// "minhas metas", "como estão as metas", "metas de economia", "como está a meta viagem".
export const GOALS_LIST_RE =
  /\b(?:minhas?\s+metas?|metas?\s+de\s+(?:economia|poupan[cç]a)|como\s+(?:est[aã]o|est[aá]|anda(?:m)?)\s+(?:as\s+|a\s+)?(?:minhas?\s+)?metas?|(?:quais|mostra(?:r)?|lista(?:r)?|ver)\s+(?:as\s+|minhas\s+)?metas?)\b/i;

// The word "meta" is required, so ordinary expenses ("coloquei 50 de gasolina") are never taken for a deposit.
const AMOUNT = String.raw`(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
export const GOAL_DEPOSIT_RE = new RegExp(
  String.raw`\b(?:guardei|guardar|poupei|poupar|depositei|juntei|coloquei|adicionei|adiciona(?:r)?|separei|reservei)\s+${AMOUNT}\s*(?:reais)?\s+(?:na|em|à|a|para\s+a|pra|para)\s+meta\s+(?:d[aeo]s?\s+)?(.+?)\s*$`,
  "i",
);
export const GOAL_WITHDRAW_RE = new RegExp(
  String.raw`\b(?:retirei|tirei|saquei|resgatei|usei)\s+${AMOUNT}\s*(?:reais)?\s+d[aoe]\s+meta\s+(?:d[aeo]s?\s+)?(.+?)\s*$`,
  "i",
);

/** "1.200,50" -> 1200.5, "200" -> 200, "200,5" -> 200.5. */
export function parseBrlAmount(raw: string): number {
  const text = raw.trim();
  if (text.includes(",")) return Number(text.replace(/\./g, "").replace(",", "."));
  // No comma: a dot followed by exactly 3 digits is a thousands separator ("1.200"), otherwise a decimal point.
  return /^\d{1,3}(\.\d{3})+$/.test(text) ? Number(text.replace(/\./g, "")) : Number(text);
}

function goalLine(g: GoalView): string {
  const bar = `${g.percent.toFixed(0)}%`;
  const head = `${g.state === "CONCLUIDA" ? "🎉" : g.behind || g.state === "VENCIDA" ? "⚠️" : "🎯"} ${g.name} — ${brl(g.saved)} de ${brl(g.target)} (${bar})`;
  if (g.state === "CONCLUIDA") return `${head} · concluída!`;
  const parts = [`faltam ${brl(g.remaining)}`];
  if (g.behind) parts.push(`atrasada: o esperado até hoje era ${brl(g.expectedSoFar ?? 0)}`);
  if (g.state === "VENCIDA") parts.push(`prazo venceu em ${dmy(g.deadline!)}`);
  else if (g.deadline) parts.push(`até ${dmy(g.deadline)}: guarde ${brl(g.monthlyNeeded ?? 0)}/mês`);
  return `${head}\n   ${parts.join(" · ")}`;
}

export async function answerGoalList(text: string, user: { workspaceId: string }): Promise<string> {
  const goals = await listGoals(user.workspaceId);
  if (goals.length === 0) {
    return "Você ainda não tem metas de economia. Crie a primeira no painel, em Metas (nome, valor e prazo), e depois é só me dizer \"guardei 200 na meta viagem\".";
  }
  // "como está a meta viagem" shows just that one.
  const one = await findGoalByMention(text.replace(GOALS_LIST_RE, " "), user.workspaceId);
  const shown = one ? goals.filter((g) => g.id === one.id) : goals;
  return ["💰 Metas de economia", ...shown.map(goalLine)].join("\n");
}

/** Handles "guardei 200 na meta viagem" / "retirei 100 da meta viagem"; null when the text is neither. */
export async function handleGoalContribution(
  text: string,
  user: { id: string; workspaceId: string },
): Promise<string | null> {
  const deposit = GOAL_DEPOSIT_RE.exec(text);
  const withdraw = deposit ? null : GOAL_WITHDRAW_RE.exec(text);
  const match = deposit ?? withdraw;
  if (!match) return null;

  const amount = parseBrlAmount(match[1]);
  const mention = match[2].replace(/[?!.]+$/, "").trim();
  if (!(amount > 0)) return "Não entendi o valor. Exemplo: \"guardei 200 na meta viagem\".";

  const goal = await findGoalByMention(mention, user.workspaceId);
  if (!goal) {
    const names = (await prisma.savingsGoal.findMany({ where: { workspaceId: user.workspaceId }, select: { name: true } })).map((g) => g.name);
    return names.length
      ? `Não encontrei a meta "${mention}". Suas metas: ${names.join(", ")}.`
      : "Você ainda não tem metas de economia. Crie a primeira no painel, em Metas.";
  }

  const result = await addContribution(goal.id, user.workspaceId, user.id, deposit ? amount : -amount);
  if (!result.ok) {
    if (result.reason === "insufficient") {
      return `A meta ${goal.name} só tem ${brl(result.saved ?? 0)} guardados, não dá para retirar ${brl(amount)}.`;
    }
    return "Não consegui registrar esse valor.";
  }

  const g = result.goal;
  const lines = [
    deposit ? `✅ ${brl(amount)} guardados em ${g.name}.` : `↩️ ${brl(amount)} retirados de ${g.name}.`,
    `Total: ${brl(g.saved)} de ${brl(g.target)} (${g.percent.toFixed(0)}%)`,
  ];
  if (result.justCompleted) lines.push("🎉 Meta concluída! Parabéns!");
  else if (g.state !== "CONCLUIDA") {
    lines.push(`Faltam ${brl(g.remaining)}${g.monthlyNeeded !== null ? ` · ${brl(g.monthlyNeeded)}/mês até ${dmy(g.deadline!)}` : ""}`);
  }
  return lines.join("\n");
}
