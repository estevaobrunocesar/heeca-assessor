import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { prisma } from "../db/client";
import {
  ExtractionSchema,
  QuerySchema,
  BillSchema,
  BillPaymentSchema,
  StatementSchema,
  type Extraction,
  type Query,
  type BillExtraction,
  type BillPayment,
  type Statement,
} from "./schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BASE_PROMPT = `Voce e o motor de interpretacao de um assessor financeiro pessoal via WhatsApp.
Sua unica tarefa e transformar uma mensagem em linguagem natural (em portugues do Brasil) em um
lancamento financeiro estruturado.

Regras:
- NUNCA invente um valor, categoria ou data que nao esteja implicito na mensagem.
- TRANSFERENCIA e SOMENTE dinheiro que muda de uma conta do proprio usuario para outra conta dele (ex: "passei 500 da
  corrente pra poupanca", "mandei 300 pro cofrinho"). Nesse caso preencha "conta" com a conta de ORIGEM e
  "conta_destino" com a conta de DESTINO, e nao e DESPESA nem RECEITA.
- Dinheiro que vem de ou vai para OUTRA PESSOA (ex: "minha esposa me passou 500", "passei 200 pro Joao", "pix de 80
  pra minha mae") NAO e transferencia interna: e RECEITA (entrou) ou DESPESA (saiu), na categoria de
  transferencias, com a pessoa em "pessoa".
- Se o valor ou a categoria estiver ambiguo, defina confianca baixa (<0.7) e preencha
  "pergunta_esclarecimento" com uma pergunta objetiva para o usuario.
- "data_relativa" deve conter a referencia temporal tal como dita (hoje, ontem, sabado passado, etc),
  ou uma data ISO se o usuario disse uma data explicita. A resolucao para data real acontece fora da IA.
- "categoria" deve ser o nome da categoria principal (ex: "Transporte") e "subcategoria" o item especifico
  dentro dela (ex: "Uber"), escolhidos a partir da lista de categorias cadastradas abaixo sempre que a
  mensagem encaixar em alguma. Se nada da lista encaixar bem, pode usar um nome novo e objetivo.
- "estabelecimento" e a marca, loja ou assunto que melhor identifica o que foi comprado, nas palavras do usuario
  (ex: "Uber", "pizza", "Mercado Livre", "academia"). Nunca uma palavra generica como "compra" ou "gasto".
  Null se a mensagem nao nomear nenhum. O estabelecimento e OPCIONAL: NUNCA pergunte por ele nem deixe de
  registrar um lancamento porque ele nao foi informado.
- "pessoa": preencha SOMENTE se o gasto e claramente PARA ou DE uma pessoa especifica que nao e o proprio usuario
  (ex: "presente pra Marilia", "mesada do Pedro", "remedio da minha mae", "escola do filho"). Se a mencao bater com
  uma pessoa da lista de pessoas cadastradas (pelo nome ou pela relacao, ex: "minha esposa" -> "Marilia"), use
  EXATAMENTE o nome da lista. Se nao estiver na lista, use o nome ou a relacao como foi dito e preencha "relacao"
  quando ela for dita (esposa, filho, mae...). Nao e pessoa: o proprio usuario, lojas e marcas, "a familia", "a casa".
  Na duvida, null — jantar "com" alguem nao e gasto dessa pessoa.
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

async function buildPeoplePrompt(workspaceId: string): Promise<string> {
  const people = await prisma.person.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  if (people.length === 0) return "\n\nPessoas cadastradas: nenhuma ainda.";
  return "\n\nPessoas cadastradas (nome — relacao):\n" + people.map((p) => p.name + (p.relation ? " — " + p.relation : "")).join("\n");
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
  const categoryPrompt = (await buildCategoryPrompt(workspaceId)) + (await buildPeoplePrompt(workspaceId));

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

  return cleanExtraction(parsed);
}

// The model sometimes returns "", "null" or "nenhuma" instead of an actual
// null for nullable string fields, even though the schema declares them
// nullable — normalize here so downstream code can rely on a real null.
function cleanExtraction(parsed: Extraction): Extraction {
  return {
    ...parsed,
    categoria: nullIfEmpty(parsed.categoria),
    subcategoria: nullIfEmpty(parsed.subcategoria),
    estabelecimento: nullIfEmpty(parsed.estabelecimento),
    pessoa: nullIfEmpty(parsed.pessoa),
    relacao: nullIfEmpty(parsed.relacao),
    conta: nullIfEmpty(parsed.conta),
    // The merchant is optional. When amount and category are clear, a question
    // about it is the model being over-careful and must not hold up the entry.
    pergunta_esclarecimento:
      parsed.valor !== null && nullIfEmpty(parsed.categoria) !== null && /estabelecimento/i.test(parsed.pergunta_esclarecimento ?? "")
        ? null
        : cleanQuestion(parsed.pergunta_esclarecimento),
  };
}

const RECEIPT_RULES = String.raw`A entrada desta vez e uma FOTO de comprovante (cupom fiscal, nota, comprovante de maquininha/cartao,
comprovante de PIX ou transferencia, recibo), nao uma mensagem de texto. Leia a imagem e extraia UM lancamento.
- "valor": o TOTAL efetivamente pago/transferido. Nunca o subtotal, o troco, o valor entregue em dinheiro nem o
  valor de um item isolado. Em compra parcelada no cartao ("3x de 50,00") use o total da compra e marque parcelado.
- "estabelecimento": o nome de quem recebeu o pagamento (loja, restaurante), como impresso, sem CNPJ. Em PIX ou
  transferencia e o FAVORECIDO ("Para: ..."), nunca o banco ou a instituicao.
- "conta": deixe null, a menos que a LEGENDA do usuario cite uma conta. Nunca copie a forma de pagamento ou o banco
  impressos no comprovante ("Cartao de Debito", "Visa", "Banco Inter") para este campo.
- "descricao": curta, com o estabelecimento (ex: "Padaria Pao Quente").
- "data_relativa": a data do comprovante em YYYY-MM-DD. Datas brasileiras sao DIA/MES/ANO (03/10 e 3 de outubro).
  Sem ano, use o ano atual. Se nao houver data legivel, use "hoje".
- "tipo": DESPESA para compras, pagamentos, PIX/transferencia enviados; RECEITA para PIX/transferencia recebidos
  ou depositos. Se a imagem NAO for um comprovante financeiro, ou o total nao estiver legivel, use tipo INDEFINIDO,
  valor null e explique em "pergunta_esclarecimento" o que nao deu para ler.
- Se a legenda do usuario trouxer conta, categoria ou parcelas, respeite-a.
- A foto pode estar torta, amassada ou cortada: se tiver duvida real sobre o total, baixe a confianca (<0.7).`;

const STATEMENT_RULES = String.raw`Voce le o TEXTO de um documento financeiro brasileiro (extrato de conta, fatura de cartao, planilha exportada do banco
ou comprovante em PDF) e lista CADA lancamento que ele contem, sem inventar nenhum.
- Numeros brasileiros: 1.234,56 = mil duzentos e trinta e quatro reais e cinquenta e seis centavos. "valor" e sempre
  positivo; o sinal vira o "tipo".
- Datas: dd/mm/aaaa ou dd/mm (ou ja em ISO). Sem ano, deduza pelo periodo do cabecalho; nunca no futuro; sem pista, o ano atual.
  Responda "data" em YYYY-MM-DD.
- EXTRATO de conta: saidas/debitos/negativos = DESPESA; entradas/creditos/positivos = RECEITA. PIX enviado e DESPESA,
  PIX recebido e RECEITA; transferencias tambem (categoria de Bancos e Transferencias).
- FATURA de cartao: compras, IOF, juros, anuidade = DESPESA. "Pagamento recebido"/"pagamento da fatura" = PAGAMENTO_FATURA.
  Estorno/credito/reembolso = RECEITA (categoria Reembolso).
- Linhas que NAO sao lancamentos (saldo anterior, saldo do dia, total, subtotal, limite, resumo, cabecalhos, rodapes,
  numeros de pagina) devem ser OMITIDAS.
- Compra parcelada aparece como "Parcela 2/5", "2/5" ou "(2/5)": preencha parcela_atual e parcela_total e tire isso da descricao.
  Isso vale SOMENTE para a linha que mostra essa marca: nas demais linhas, parcela_atual e parcela_total ficam null.
  Nunca copie a parcela de uma linha para as outras.
- "estabelecimento": nome limpo de quem recebeu/enviou (ex: "Padaria Pao Quente"), sem codigos de filial nem CNPJ.
- Escolha categoria/subcategoria da lista cadastrada quando houver encaixe claro; prefira a mais especifica e evite "Outros".
- "conta": o banco ou cartao citado no cabecalho do documento (ex: "Nubank", "Itau"), se houver.
- "tipo_documento": EXTRATO_CONTA, FATURA_CARTAO, COMPROVANTE (um unico comprovante) ou OUTRO.
- NUNCA invente. Se o trecho for ilegivel, embaralhado ou nao tiver nenhum lancamento real, devolva a lista de
  lancamentos VAZIA. So liste um lancamento se voce conseguir ler a data e o valor dele no proprio documento.`;

/** Reads one chunk of a document's text into entries; header is the start of the document, for context. */
export async function extractStatementChunk(
  chunk: string,
  header: string,
  caption: string,
  workspaceId: string,
  today: Date,
): Promise<Statement> {
  const categoryPrompt = await buildCategoryPrompt(workspaceId);
  const iso = today.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: STATEMENT_RULES + "\n\nHoje e " + iso + "." + categoryPrompt },
      {
        role: "user",
        content:
          (caption ? "Legenda do usuario: " + caption + "\n\n" : "") +
          "Inicio do documento (contexto):\n" + header + "\n\n--- TRECHO A LER ---\n" + chunk,
      },
    ],
    response_format: zodResponseFormat(StatementSchema, "statement"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("AI did not return a parseable statement");
  return {
    ...parsed,
    conta: nullIfEmpty(parsed.conta),
    lancamentos: parsed.lancamentos.map((l) => ({
      ...l,
      estabelecimento: nullIfEmpty(l.estabelecimento),
      categoria: nullIfEmpty(l.categoria),
      subcategoria: nullIfEmpty(l.subcategoria),
    })),
  };
}

export type ReceiptImage = { contentType: string; base64: string };

/** Reads a photographed receipt into the same Extraction a typed message produces. */
export async function extractFromReceipt(
  image: ReceiptImage,
  caption: string,
  workspaceId: string,
  today: Date,
): Promise<Extraction> {
  const categoryPrompt = await buildCategoryPrompt(workspaceId);
  const iso = today.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: `${BASE_PROMPT}\n\n${RECEIPT_RULES}\n\nHoje e ${iso}.${categoryPrompt}` },
      {
        role: "user",
        content: [
          { type: "text", text: caption || "Registre este comprovante." },
          { type: "image_url", image_url: { url: `data:${image.contentType};base64,${image.base64}` } },
        ],
      },
    ],
    response_format: zodResponseFormat(ExtractionSchema, "extraction"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("AI did not return a parseable receipt extraction");
  return cleanExtraction(parsed);
}

/** Reads a statement from page images, for PDFs whose text layer is missing or unreadable (scanned, odd fonts). */
export async function extractStatementFromImages(
  images: string[],
  caption: string,
  workspaceId: string,
  today: Date,
): Promise<Statement> {
  const categoryPrompt = await buildCategoryPrompt(workspaceId);
  const iso = today.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: STATEMENT_RULES + "\n\nAs paginas do documento chegam como IMAGENS: leia o que esta escrito nelas.\n\nHoje e " + iso + "." + categoryPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: (caption ? "Legenda do usuario: " + caption + "\n\n" : "") + "Liste os lancamentos destas paginas." },
          ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
        ],
      },
    ],
    response_format: zodResponseFormat(StatementSchema, "statement"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("AI did not return a parseable statement");
  return {
    ...parsed,
    conta: nullIfEmpty(parsed.conta),
    lancamentos: parsed.lancamentos.map((l) => ({
      ...l,
      estabelecimento: nullIfEmpty(l.estabelecimento),
      categoria: nullIfEmpty(l.categoria),
      subcategoria: nullIfEmpty(l.subcategoria),
    })),
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
- "conta" so se a pessoa citou um banco/cartao/conta; senao null.
- "pessoa": se a pergunta e sobre uma pessoa especifica ("quanto gastei com a Marilia?", "gastos do Pedro", "com meu
  filho"), use EXATAMENTE o nome da lista de pessoas cadastradas quando a mencao bater (pelo nome ou pela relacao).
  Se a pergunta cita uma pessoa que NAO esta na lista, devolva o nome ou a relacao como foi dito (o sistema avisa que
  ela nao existe) — nunca troque por null. Use null somente quando a pergunta nao e sobre uma pessoa. "por_pessoa" true quando pede o detalhamento por pessoa ("por pessoa", "quem gastou mais", "gastos de cada um").`;

export async function interpretQuery(message: string, workspaceId: string, today: Date): Promise<Query> {
  const categoryPrompt = (await buildCategoryPrompt(workspaceId)) + (await buildPeoplePrompt(workspaceId));
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
    pessoa: nullIfEmpty(parsed.pessoa),
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
    pergunta_esclarecimento: cleanQuestion(parsed.pergunta_esclarecimento),
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
    pergunta_esclarecimento: cleanQuestion(parsed.pergunta_esclarecimento),
  };
}

const HAS_LETTER_RE = /\p{L}/u;

// The model occasionally returns a corrupted fragment ("." , ".}", ":", "1")
// instead of an actual null for nullable string fields, even though the
// schema declares them nullable — likely a truncated/malformed JSON stream
// that the SDK's structured-output parsing lets through anyway. Anything
// without at least one letter in it can't be a real category/account name or
// question, so treat it the same as null.
// A clarification question that is sent to the user must read as one: the
// model has also returned corrupted fragments (".n") here, which have a letter
// and so survive nullIfEmpty. A real question has more than one word.
function cleanQuestion(value: string | null): string | null {
  const question = nullIfEmpty(value);
  return question && question.trim().split(/\s+/).length >= 2 ? question : null;
}

function nullIfEmpty(value: string | null): string | null {
  if (!value) return null;
  // A real name, category or question starts with a letter or digit. One that
  // starts with punctuation (".tv", ".}") is a corrupted fragment of the
  // model's JSON, not something the user said.
  if (!/^[\p{L}\p{N}]/u.test(value.trim())) return null;
  // Strip stray punctuation at the edges too ("null.") before comparing.
  const normalized = value.trim().toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (normalized === "" || normalized === "null" || normalized === "none" || normalized === "nenhuma") return null;
  if (!HAS_LETTER_RE.test(normalized)) return null;
  return value;
}
