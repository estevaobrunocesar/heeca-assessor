import { z } from "zod";

export const ExtractionSchema = z.object({
  tipo: z.enum(["DESPESA", "RECEITA", "TRANSFERENCIA", "INDEFINIDO"]),
  valor: z
    .number()
    .nullable()
    .describe(
      "The TOTAL purchase amount. If the user gave a per-installment amount instead (e.g. '5x de 100'), multiply it out to the total (500), never the per-installment figure.",
    ),
  categoria: z.string().nullable(),
  subcategoria: z.string().nullable(),
  descricao: z.string(),
  conta: z
    .string()
    .nullable()
    .describe("Bank/account mention if the user named one (e.g. 'Itaú', 'cartão Nubank'), otherwise null"),
  data_relativa: z.string().describe("e.g. 'hoje', 'ontem', 'sabado', or an ISO date if explicit"),
  recorrente: z.boolean(),
  parcelado: z.boolean(),
  numero_parcelas: z.number().nullable(),
  confianca: z.number().min(0).max(1),
  pergunta_esclarecimento: z
    .string()
    .nullable()
    .describe("If confidence is low or a required field is missing, the question to ask the user instead of guessing"),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const QuerySchema = z.object({
  eh_consulta: z
    .boolean()
    .describe("true only if the message asks about already-registered spending/income/balance; false for a new entry or any other command"),
  tipo: z.enum(["DESPESA", "RECEITA", "AMBOS"]),
  data_inicio: z.string().describe("Inclusive start date, YYYY-MM-DD"),
  data_fim: z.string().describe("Inclusive end date, YYYY-MM-DD"),
  categoria: z.string().nullable(),
  subcategoria: z.string().nullable(),
  conta: z.string().nullable(),
  descricao_periodo: z.string().describe("Short human label for the period, e.g. 'setembro de 2026', 'esta semana'"),
});

export type Query = z.infer<typeof QuerySchema>;
