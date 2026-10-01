import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ExtractionSchema, type Extraction } from "./schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Voce e o motor de interpretacao de um assessor financeiro pessoal via WhatsApp.
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
- Categorias sugeridas (despesas): Casa, Alimentacao, Transporte, Saude, Educacao, Lazer, Financeiro.
- Categorias sugeridas (receitas): Salario, Comissao, Freelance, Vendas, Investimentos, Reembolso, Outros.`;

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const file = new File([audioBuffer], filename, { type: "audio/ogg" });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "pt",
  });
  return result.text;
}

export async function extractTransaction(message: string): Promise<Extraction> {
  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
    response_format: zodResponseFormat(ExtractionSchema, "extraction"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("AI did not return a parseable extraction");
  }

  // The model sometimes returns "" instead of null for "no question" even
  // though the schema declares it nullable — normalize here so downstream
  // code can rely on a real null.
  return {
    ...parsed,
    pergunta_esclarecimento: parsed.pergunta_esclarecimento || null,
  };
}
