import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { prisma } from "../db/client";
import {
  ExtractionSchema,
  QuerySchema,
  BillSchema,
  BillPaymentSchema,
  type Extraction,
  type Query,
  type BillExtraction,
  type BillPayment,
} from "./schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BASE_PROMPT = `Voce e o motor de interpretacao de um assessor financeiro pessoal via WhatsApp.
Sua unica tarefa e transformar uma mensagem em linguagem natural (em portugues do Brasil) em um
lancamento financeiro estruturado.

Regras:
- NUNCA invente um valor, categoria ou data que nao esteja implicito na mensagem.
- Se a mensagem descrever uma transferencia entre contas/pessoas (ex: "passei 500 da corrente pra poupanca",
  "minha esposa me passou 500"), classifique como TRANSFERENCIA, nao DESPESA nem RECEITA.
- Se o valor ou a categoria estiver ambiguo, defina confianca baixa (<0.7) e preencha
  "pergunta_esclarecimento" com uma pergunta objetiva para o usuario.
- "data_relativa" deve conter a referencia temporal tal como dita (hoje, ontem, sabado passado, etc),
  ou uma data ISO se o usuario disse uma data explicita. A resolucao para data real acontece fora da IA.
- "categoria" deve ser o nome da categoria principal (ex: "Transporte") e "subcategoria" o item especifico
  dentro dela (ex: "Uber"), escolhidos a partir da lista de categorias cadastradas abaixo sempre que a
  mensagem encaixar em alguma. Se nada da lista encaixar bem, pode usar um nome novo e objetivo.
- Se o usuario mencionar um banco, cartao ou conta especifica (ex: "no cartao Nubank", "da conta do Itau"),
  preencha "conta" com esse nome tal como dito. Se nao mencionar nenhuma conta, deixe "conta" como null —
  NAO assuma uma conta padrao, isso e resolvido fora da IA.
- Se a compra for parcelada (ex: "parcelei em 5 vezes", "em 3x", "5x de 100"), marque "parcelado" true e
  preencha "numero_parcelas". "valor" deve SEMPRE ser o total da compra — se o usuario disse o valor da
  parcela (ex: "5x de 100"), multiplique pelo numero de parcelas para obter o total (500). A divisao em
  parcelas mensais acontece fora da IA.`;

async function buildCategoryPrompt(workspaceId: string): Promise<string> {
  const categories = await prisma.category.findMany({
    where: { workspaceId },
    include: { children: true },
    orderBy: { name: "asc" },
  });

  const expense = categories.filter((c) => c.type === "EXPENSE" && !c.parentId);
  const income = categories.filter((c) => c.type === "INCOME" && !c.parentId);

  const formatGroup = (group: typeof expense) =>
    group.map((c) => `${c.name}: ${c.children.map((ch) => ch.name).join(", ")}`).join("\n");

  return `\n\nCategorias cadastradas (despesas):\n${formatGroup(expense)}\n\nCategorias cadastradas (receitas):\n${income.map((c) => c.name).join(", ")}`;
}

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const file = new File([audioBuffer], filename, { type: "audio/ogg" });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "pt",
  });
  return result.text;
}

export async function extractTransaction(message: string, workspaceId: string): Promise<Extraction> {
  const categoryPrompt = await buildCategoryPrompt(workspaceId);

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: BASE_PROMPT + categoryPrompt },
      { role: "user", content: message },
    ],
    response_format: zodResponseFormat(ExtractionSchema, "extraction"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("AI did not return a parseable extraction");
  }

  // The model sometimes returns "", "null" or "nenhuma" instead of an actual
  // null for nullable string fields, even though the schema declares them
  // nullable — normalize here so downstream code can rely on a real null.
  return {
    ...parsed,
    categoria: nullIfEmpty(parsed.categoria),
    subcategoria: nullIfEmpty(parsed.subcategoria),
    conta: nullIfEmpty(parsed.conta),
    pergunta_esclarecimento: nullIfEmpty(parsed.pergunta_esclarecimento),
  };
}

const QUERY_PROMPT = `Voce interpreta perguntas sobre financas pessoais feitas por WhatsApp (portugues do Brasil).
Decida se a mensagem e uma CONSULTA sobre lancamentos ja registrados (quanto gastou/recebeu, extrato, saldo
do periodo, gasto com uma categoria ou conta) — eh_consulta true — ou se e outra coisa, como um lancamento
novo ("gastei 50 no posto") ou um comando — eh_consulta false (nesse caso os demais campos sao ignorados).

Se for consulta:
- Resolva o periodo para datas reais YYYY-MM-DD (inclusivas) a partir da data de hoje informada abaixo.
  Sem periodo citado, use o mes atual inteiro. "semana" = segunda a domingo da semana atual; "mes passado" =
  o mes anterior inteiro; "ultimos N dias" termina hoje; um mes citado sem ano e o do ano atual (ou o mais
  recente que ja passou, se ainda nao chegou).
- "tipo": DESPESA para gastos, RECEITA para ganhos, AMBOS para resumo/saldo/resultado geral.
- Escolha "categoria"/"subcategoria" da lista cadastrada quando a pergunta citar um assunto (ex: "gasolina" ->
  Transporte > Combustivel). Prefira sempre a categoria mais especifica (ex: pizza -> Alimentacao > Delivery ou Restaurante) e
  evite "Outros" a menos que nada encaixe. Sem assunto especifico, deixe null.
- "conta" so se a pessoa citou um banco/cartao/conta; senao null.`;

export async function interpretQuery(message: string, workspaceId: string, today: Date): Promise<Query> {
  const categoryPrompt = await buildCategoryPrompt(workspaceId);
  const iso = today.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const weekday = today.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: `${QUERY_PROMPT}\n\nHoje e ${iso} (${weekday}).${categoryPrompt}` },
      { role: "user", content: message },
    ],
    response_format: zodResponseFormat(QuerySchema, "query"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("AI did not return a parseable query");

  return {
    ...parsed,
    categoria: nullIfEmpty(parsed.categoria),
    subcategoria: nullIfEmpty(parsed.subcategoria),
    conta: nullIfEmpty(parsed.conta),
  };
}

const BILL_PROMPT = `Voce interpreta mensagens de WhatsApp (portugues do Brasil) em que a pessoa registra uma CONTA A PAGAR:
algo que ainda precisa pagar no futuro (aluguel, luz, boleto, condominio, parcela de carro...). Se a mensagem for
um gasto que ja aconteceu ("gastei", "paguei", "comprei"), uma pergunta ou qualquer outro comando,
eh_conta_a_pagar e false. Uma conta que "venceu"/"esta vencida"/"esta atrasada" SEM a pessoa dizer que pagou
continua sendo conta a pagar (em atraso): eh_conta_a_pagar true, com o vencimento no passado.

Se for conta a pagar:
- "descricao" curta e objetiva (ex: "Aluguel", "Conta de luz").
- "valor": o valor informado; null se nao disse.
- "vencimento": data real YYYY-MM-DD calculada a partir de hoje (informado abaixo). "dia 10" sem mes = o proximo dia 10
  que ainda nao passou (hoje conta); "sexta" = a proxima sexta; "amanha", "semana que vem" etc. resolva normalmente.
  Null se nao disse nenhuma data.
- Se faltar valor ou vencimento, preencha "pergunta_esclarecimento" com uma pergunta objetiva.
- "repete_mensalmente" true se disse que se repete todo mes (mensal, fixa, "todo dia 10").
- Escolha categoria/subcategoria da lista cadastrada quando encaixar (ex: luz -> Moradia > Energia eletrica); prefira a mais
  especifica e evite "Outros". "conta" so se citou um banco/cartao/conta para pagar.`;

const BILL_PAYMENT_PROMPT = `Voce identifica, em uma mensagem de WhatsApp (portugues do Brasil), se a pessoa esta dizendo que
PAGOU uma das contas a pagar pendentes listadas abaixo (ex: "paguei o aluguel", "ja paguei a luz").
- eh_pagamento_de_conta true somente se a mensagem se refere claramente a uma conta da lista. Um gasto comum
  ("paguei 50 no mercado") nao e pagamento de conta a menos que bata com uma conta pendente.
- "conta_id": copie exatamente o id da conta que bate. Se mais de uma puder bater e nao der para saber qual,
  deixe conta_id null e preencha "pergunta_esclarecimento" perguntando qual.
- "valor_pago" so se a pessoa disse um valor.`;

export async function interpretBill(message: string, workspaceId: string, today: Date): Promise<BillExtraction> {
  const categoryPrompt = await buildCategoryPrompt(workspaceId);
  const iso = today.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const weekday = today.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: `${BILL_PROMPT}\n\nHoje e ${iso} (${weekday}).${categoryPrompt}` },
      { role: "user", content: message },
    ],
    response_format: zodResponseFormat(BillSchema, "bill"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("AI did not return a parseable bill");

  return {
    ...parsed,
    vencimento: /^\d{4}-\d{2}-\d{2}$/.test(parsed.vencimento?.trim() ?? "") ? parsed.vencimento!.trim() : null,
    categoria: nullIfEmpty(parsed.categoria),
    subcategoria: nullIfEmpty(parsed.subcategoria),
    conta: nullIfEmpty(parsed.conta),
    pergunta_esclarecimento: nullIfEmpty(parsed.pergunta_esclarecimento),
  };
}

export async function interpretBillPayment(
  message: string,
  pending: { id: string; description: string; amount: number; dueDate: string }[],
): Promise<BillPayment> {
  const list = pending.map((b) => `${b.id} | ${b.description} | R$ ${b.amount.toFixed(2)} | vence ${b.dueDate}`).join("\n");

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: `${BILL_PAYMENT_PROMPT}\n\nContas pendentes (id | descricao | valor | vencimento):\n${list}` },
      { role: "user", content: message },
    ],
    response_format: zodResponseFormat(BillPaymentSchema, "bill_payment"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("AI did not return a parseable bill payment");

  return {
    ...parsed,
    conta_id: parsed.conta_id?.trim() && parsed.conta_id.trim().toLowerCase() !== "null" ? parsed.conta_id.trim() : null,
    pergunta_esclarecimento: nullIfEmpty(parsed.pergunta_esclarecimento),
  };
}

const HAS_LETTER_RE = /\p{L}/u;

// The model occasionally returns a corrupted fragment ("." , ".}", ":", "1")
// instead of an actual null for nullable string fields, even though the
// schema declares them nullable — likely a truncated/malformed JSON stream
// that the SDK's structured-output parsing lets through anyway. Anything
// without at least one letter in it can't be a real category/account name or
// question, so treat it the same as null.
function nullIfEmpty(value: string | null): string | null {
  if (!value) return null;
  // Strip stray punctuation at the edges too (".null", "null.") before comparing.
  const normalized = value.trim().toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (normalized === "" || normalized === "null" || normalized === "none" || normalized === "nenhuma") return null;
  if (!HAS_LETTER_RE.test(normalized)) return null;
  return value;
}
