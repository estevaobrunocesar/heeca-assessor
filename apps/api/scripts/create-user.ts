import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Usage: npx tsx scripts/create-user.ts "Bruno" "+5511999998888" ADMIN
async function main() {
  const [name, phone, role] = process.argv.slice(2);
  if (!name || !phone) {
    console.error('Usage: tsx scripts/create-user.ts "Name" "+55..." [ADMIN|USER]');
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: { name, whatsappPhone: phone, role: (role as "ADMIN" | "USER") ?? "USER" },
  });

  console.log("Created user:", user);
}

main().finally(() => prisma.$disconnect());
