import "dotenv/config";
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Usage: npx tsx scripts/import-nubank-csv.ts "C:\path\fatura.csv" "+5511999998888" "Cartão de Crédito - NuBank"
//   arg2: WhatsApp phone of any user in the target workspace
//   arg3: exact name of the credit card account to import into

// Minimal CSV parser that handles Nubank's export: quoted fields with
// doubled internal quotes (e.g. "IOF de ""Twilio Inc""").
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseBrlAmount(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}

// Best-effort merchant -> category/subcategory classifier. Falls back to
// Outros/Outros (and logs a warning) for anything unrecognized, so an
// unmapped merchant never silently gets the wrong category — it's visible
// in the output for manual review instead.
const RULES: [RegExp, string, string][] = [
  [/^iof de/i, "Financeiro", "IOF"],
  [/twilio/i, "Trabalho e Profissional", "Software profissional"],
  [/hetzner/i, "Trabalho e Profissional", "Software profissional"],
  [/anthropic/i, "Trabalho e Profissional", "Software profissional"],
  [/registrobr/i, "Trabalho e Profissional", "Software profissional"],
  [/amazonprime/i, "Assinaturas", "Amazon Prime"],
  [/apple\.com/i, "Assinaturas", "Apple"],
  [/nubank\+/i, "Assinaturas", "Outras assinaturas"],
  [/vindi/i, "Assinaturas", "Outras assinaturas"],
  [/pegpao/i, "Alimentação", "Padaria"],
  [/superfilter/i, "Casa e Utilidades", "Outros"],
  [/shein/i, "Roupas e Acessórios", "Roupas"],
  [/parkin/i, "Transporte", "Estacionamento"],
  [/plano nucel/i, "Comunicação", "Plano móvel"],
  [/imersaovda|imersao/i, "Educação", "Cursos"],
  [/joias|pandora/i, "Roupas e Acessórios", "Joias"],
  [/temu/i, "Compras", "Compras online"],
  [/mercadolivre/i, "Compras", "Marketplace"],
  [/jessicaviana/i, "Saúde", "Outros"],
  [/havan/i, "Compras", "Casa"],
];

function classify(title: string): { categoria: string; subcategoria: string } {
  for (const [re, categoria, subcategoria] of RULES) {
    if (re.test(title)) return { categoria, subcategoria };
  }
  console.warn(`  [sem regra] "${title}" -> Outros/Outros (revise manualmente)`);
  return { categoria: "Outros", subcategoria: "Outros" };
}

function stripInstallmentSuffix(title: string): { description: string; installmentNo: number | null; installmentTotal: number | null } {
  const match = title.match(/^(.*?)\s*-\s*Parcela\s+(\d+)\/(\d+)$/i);
  if (!match) return { description: title, installmentNo: null, installmentTotal: null };
  return { description: match[1].trim(), installmentNo: Number(match[2]), installmentTotal: Number(match[3]) };
}

async function resolveCategoryId(name: string, subcategoria: string, workspaceId: string) {
  const parent = await prisma.category.findFirst({ where: { workspaceId, name, type: "EXPENSE", parentId: null } });
  if (!parent) throw new Error(`Categoria "${name}" não encontrada no workspace`);
  const child = await prisma.category.findFirst({ where: { workspaceId, name: subcategoria, parentId: parent.id } });
  return (child ?? parent).id;
}

async function main() {
  const [csvPath, phone, accountName] = process.argv.slice(2);
  if (!csvPath || !phone || !accountName) {
    console.error('Usage: tsx scripts/import-nubank-csv.ts "<csv>" "+55..." "<account name>"');
    process.exit(1);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { whatsappPhone: phone } });
  const account = await prisma.account.findFirstOrThrow({ where: { workspaceId: user.workspaceId, name: accountName } });

  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text).slice(1); // drop header

  let imported = 0;
  let skipped = 0;

  for (const [dateStr, titleRaw, amountStr] of rows) {
    if (!dateStr || !titleRaw) continue;
    const title = titleRaw.trim();
    // Round to cents explicitly: binary floats can't represent values like
    // 66.90 or 572.32 exactly, and comparing an un-rounded JS number against
    // the DB's Decimal column for the idempotency check below would
    // silently miss the match and re-insert a duplicate.
    const amount = Math.round(Math.abs(parseBrlAmount(amountStr)) * 100) / 100;
    const date = new Date(`${dateStr}T00:00:00.000Z`);

    const isPayment = /^pagamento recebido/i.test(title);
    const { description, installmentNo, installmentTotal } = stripInstallmentSuffix(title);
    const finalDescription = isPayment ? "Pagamento da fatura" : description;

    const existing = await prisma.transaction.findFirst({
      where: {
        accountId: account.id,
        date,
        description: finalDescription,
        amount: { gte: amount - 0.005, lte: amount + 0.005 },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    if (isPayment) {
      await prisma.transaction.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.id,
          accountId: account.id,
          type: "ADJUSTMENT",
          amount,
          description: finalDescription,
          date,
          origin: "DASHBOARD",
        },
      });
      imported++;
      continue;
    }

    const { categoria, subcategoria } = classify(description);
    const categoryId = await resolveCategoryId(categoria, subcategoria, user.workspaceId);

    await prisma.transaction.create({
      data: {
        workspaceId: user.workspaceId,
        userId: user.id,
        accountId: account.id,
        categoryId,
        type: "EXPENSE",
        amount,
        description,
        date,
        isInstallment: installmentNo !== null,
        installmentNo: installmentNo ?? undefined,
        installmentTotal: installmentTotal ?? undefined,
        origin: "DASHBOARD",
      },
    });
    imported++;
  }

  console.log(`Importados: ${imported}. Pulados (já existiam): ${skipped}.`);
}

main().finally(() => prisma.$disconnect());
