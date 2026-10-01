import { PrismaClient } from "@prisma/client";
import { seedDefaultCategories } from "../src/financial/seedCategories";

const prisma = new PrismaClient();

async function main() {
  const workspaces = await prisma.workspace.findMany();
  for (const workspace of workspaces) {
    await seedDefaultCategories(workspace.id);
    console.log(`Seeded categories for workspace "${workspace.name}".`);
  }
}

main().finally(() => prisma.$disconnect());
