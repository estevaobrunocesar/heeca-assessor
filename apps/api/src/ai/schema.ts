import { z } from "zod";

export const ExtractionSchema = z.object({
  tipo: z.enum(["DESPESA", "RECEITA", "TRANSFERENCIA", "INDEFINIDO"]),
  valor: z.number().nullable(),
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
