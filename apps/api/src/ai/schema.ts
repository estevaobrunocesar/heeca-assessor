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
  estabelecimento: z
    .string()
    .nullable()
    .describe(
      "The merchant, brand or subject that best identifies what was bought, in the user's own words (e.g. 'Uber', 'pizza', 'Mercado Livre', 'academia'). Never a generic word like 'compra' or 'gasto'. null if the message names none.",
    ),
  pessoa: z
    .string()
    .nullable()
    .describe(
      "The specific person (not the user) this entry is for or about, as a registered name when it matches the list given, otherwise as said. null when none is mentioned or it is the user's own spending.",
    ),
  relacao: z
    .string()
    .nullable()
    .describe("The relation to the user if stated, e.g. 'esposa', 'filho', 'mae'. null otherwise."),
  conta: z
    .string()
    .nullable()
    .describe("Bank/account mention if the user named one (e.g. 'Itaú', 'cartão Nubank'), otherwise null"),
  conta_destino: z
    .string()
    .nullable()
    .describe("Only for TRANSFERENCIA between the user's own accounts: the account the money went TO (e.g. 'poupança'). null otherwise."),
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
  pessoa: z.string().nullable().describe("Registered person name (or relation) the question is about; null when none"),
  por_pessoa: z.boolean().describe("true when the user asks for a breakdown per person ('por pessoa', 'quem gastou mais')"),
  descricao_periodo: z.string().describe("Short human label for the period, e.g. 'setembro de 2026', 'esta semana'"),
});

export type Query = z.infer<typeof QuerySchema>;

export const BillSchema = z.object({
  eh_conta_a_pagar: z
    .boolean()
    .describe("true only if the user is registering something they still have to pay in the future; false for a past/just-made expense, a question or any other command"),
  descricao: z.string(),
  valor: z.number().nullable(),
  vencimento: z.string().nullable().describe("Due date as YYYY-MM-DD, or null if the user gave none"),
  categoria: z.string().nullable(),
  subcategoria: z.string().nullable(),
  conta: z.string().nullable(),
  repete_mensalmente: z.boolean().describe("true when the user says it recurs every month (e.g. 'todo mês', 'mensal', 'fixa')"),
  pergunta_esclarecimento: z.string().nullable().describe("Question to ask if the amount or due date is missing"),
});

export type BillExtraction = z.infer<typeof BillSchema>;

export const BillPaymentSchema = z.object({
  eh_pagamento_de_conta: z
    .boolean()
    .describe("true only if the user says they paid one of the pending bills listed; false for any other expense"),
  conta_id: z.string().nullable().describe("The id of the matching pending bill, copied exactly from the list; null if none or ambiguous"),
  valor_pago: z.number().nullable().describe("Amount paid if the user stated one that may differ from the bill, otherwise null"),
  pergunta_esclarecimento: z.string().nullable().describe("If several bills could match, a short question asking which one"),
});

export type BillPayment = z.infer<typeof BillPaymentSchema>;

export const StatementLineSchema = z.object({
  data: z.string().describe("Entry date as YYYY-MM-DD"),
  descricao: z.string().describe("Description as written in the document, without the installment suffix"),
  estabelecimento: z.string().nullable().describe("Merchant or counterparty name, without branch codes or CNPJ"),
  valor: z.number().describe("Absolute amount in BRL, always positive"),
  tipo: z.enum(["DESPESA", "RECEITA", "PAGAMENTO_FATURA", "IGNORAR"]),
  categoria: z.string().nullable(),
  subcategoria: z.string().nullable(),
  parcela_atual: z.number().nullable().describe("Installment number when the line shows e.g. 'Parcela 2/5' or '2/5'"),
  parcela_total: z.number().nullable(),
});

export const StatementSchema = z.object({
  tipo_documento: z.enum(["EXTRATO_CONTA", "FATURA_CARTAO", "COMPROVANTE", "OUTRO"]),
  conta: z.string().nullable().describe("Bank or card named in the document header, if any"),
  lancamentos: z.array(StatementLineSchema),
});

export type StatementLine = z.infer<typeof StatementLineSchema>;
export type Statement = z.infer<typeof StatementSchema>;
