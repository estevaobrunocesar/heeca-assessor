import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPENSE_CATEGORIES: Record<string, string[]> = {
  Casa: ["Aluguel", "Condomínio", "Energia", "Água", "Gás", "Internet", "Manutenção", "Móveis", "Outros"],
  Alimentação: ["Mercado", "Restaurante", "Delivery", "Padaria", "Lanches", "Outros"],
  Transporte: ["Combustível", "Uber", "99", "Estacionamento", "Pedágio", "Manutenção", "Seguro", "IPVA"],
  Saúde: ["Plano de saúde", "Consulta", "Exames", "Farmácia", "Dentista", "Outros"],
  Educação: ["Escola", "Cursos", "Livros", "Materiais"],
  Lazer: ["Viagens", "Cinema", "Restaurantes", "Entretenimento", "Outros"],
  Financeiro: ["Tarifas", "Juros", "Empréstimos", "Financiamentos", "Cartão"],
};

const INCOME_CATEGORIES = ["Salário", "Comissão", "Freelance", "Prestação de serviços", "Venda", "Rendimentos", "Investimentos", "Reembolso", "Transferência recebida", "Outros"];

// Prisma's compound-unique "where" doesn't accept a literal null for a
// nullable key column, so root categories (parentId IS NULL) can't use
// upsert's unique-where shortcut — fall back to findFirst + create.
async function upsertRootCategory(name: string, type: "EXPENSE" | "INCOME") {
  const existing = await prisma.category.findFirst({ where: { name, parentId: null, type } });
  if (existing) return existing;
  return prisma.category.create({ data: { name, type } });
}

async function main() {
  for (const [parentName, children] of Object.entries(EXPENSE_CATEGORIES)) {
    const parent = await upsertRootCategory(parentName, "EXPENSE");
    for (const childName of children) {
      await prisma.category.upsert({
        where: { name_parentId: { name: childName, parentId: parent.id } },
        update: {},
        create: { name: childName, type: "EXPENSE", parentId: parent.id },
      });
    }
  }

  for (const name of INCOME_CATEGORIES) {
    await upsertRootCategory(name, "INCOME");
  }

  console.log("Seeded categories.");
}

main().finally(() => prisma.$disconnect());
