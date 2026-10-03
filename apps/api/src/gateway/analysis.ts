import { formatAnalysis, getFinanceAnalysis } from "../financial/bottlenecks";

// "como estão minhas finanças?", "como está meu financeiro?", "gargalos", "análise financeira", "onde estou gastando mais?".
export const FINANCES_RE =
  /\b(?:como\s+(?:est[aã]o|est[aá]|anda(?:m)?|vai|v[aã]o)\s+(?:a\s+|as\s+|minha\s+|minhas\s+|meu\s+|meus\s+)?(?:minhas?\s+)?(?:finan[cç]as|financeiro|vida\s+financeira)|gargalos?(?:\s+financeiros?)?|an[aá]lise\s+financeira|onde\s+(?:estou|to|tô)\s+gastando\s+mais)\b/i;

export async function answerFinances(user: { workspaceId: string }): Promise<string> {
  return formatAnalysis(await getFinanceAnalysis(user.workspaceId));
}
