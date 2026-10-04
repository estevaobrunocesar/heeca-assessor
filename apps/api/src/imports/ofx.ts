import type { StatementLine } from "../ai/schema";
import type { ParsedDocument } from "./statement";
import { MAX_ITEMS } from "./statement";
import { FriendlyError } from "./document";

/** True when the text is an OFX/QFX file (SGML header or XML body). */
export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 2000);
  return /OFXHEADER\s*:/i.test(head) || /<OFX[\s>]/i.test(head);
}

/** The value of a tag in a block: works for SGML (`<TRNAMT>-5.00`) and XML (`<TRNAMT>-5.00</TRNAMT>`). */
function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  const value = match?.[1]?.trim();
  return value ? decodeEntities(value) : null;
}

function decodeEntities(text: string): string {
  return text.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}

/** "20260915120000[-3:BRT]" -> "2026-09-15"; null if it is not a date. */
export function ofxDate(raw: string | null): string | null {
  const match = raw ? /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim()) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** OFX amounts use a dot, but some Brazilian exports use a comma ("-1.234,56" is handled too). */
export function ofxAmount(raw: string | null): number | null {
  if (!raw) return null;
  const text = raw.trim().replace(/\s/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const PAYMENT_RE = /pagamento|payment|pgto|pag\s*fatura|credito\s+em\s+conta/i;
const INSTALLMENT_RE = /parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Reads an OFX statement or credit-card statement into the same lines the AI reader produces, so
 * the rest of the import (categories, duplicates, preview, undo) is shared. Nothing is guessed:
 * the sign of the amount decides expense or income, and a positive amount on a card named a
 * payment is the card bill being paid.
 */
export function parseOfx(text: string): ParsedDocument {
  if (!looksLikeOfx(text)) throw new FriendlyError("Esse arquivo não parece ser um OFX válido.");

  const isCard = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>|<CCSTMTTRNRS>/i.test(text);
  const org = tag(text, "ORG");
  const seen = new Set<string>();
  const lines: StatementLine[] = [];
  let total = 0;

  // A transaction runs from <STMTTRN> to </STMTTRN>, or (SGML without closing tags) to the next block.
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>/i)[0];
    const amount = ofxAmount(tag(block, "TRNAMT"));
    const date = ofxDate(tag(block, "DTPOSTED"));
    if (amount === null || amount === 0 || !date) continue;

    // The bank's own id for the entry: the same one twice in a file is the same entry.
    const fitid = tag(block, "FITID");
    if (fitid) {
      if (seen.has(fitid)) continue;
      seen.add(fitid);
    }

    total++;
    if (lines.length >= MAX_ITEMS) continue;

    const name = tag(block, "NAME");
    const memo = tag(block, "MEMO");
    const description = clean(memo && name && memo.toLowerCase().startsWith(name.toLowerCase()) ? memo : [name, memo].filter(Boolean).join(" - ")) || "Lançamento importado";

    const installment = INSTALLMENT_RE.exec(description);
    const parcelaTotal = installment ? Number(installment[2]) : null;
    const isInstallment = installment !== null && parcelaTotal !== null && parcelaTotal > 1 && Number(installment[1]) <= parcelaTotal;

    lines.push({
      data: date,
      descricao: description,
      estabelecimento: clean(name ?? description).slice(0, 60) || null,
      valor: Math.abs(amount),
      tipo: amount < 0 ? "DESPESA" : isCard && PAYMENT_RE.test(description) ? "PAGAMENTO_FATURA" : "RECEITA",
      categoria: null,
      subcategoria: null,
      parcela_atual: isInstallment ? Number(installment![1]) : null,
      parcela_total: isInstallment ? parcelaTotal : null,
    });
  }

  return { documentType: isCard ? "FATURA_CARTAO" : "EXTRATO_CONTA", accountMention: org, lines, truncated: total > MAX_ITEMS };
}
