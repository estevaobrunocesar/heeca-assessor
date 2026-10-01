import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Usage: npx tsx scripts/create-user.ts "Bruno" "+5511999998888" ADMIN "dashboardPassword"
async function main() {
  const [name, phone, role, password] = process.argv.slice(2);
  if (!name || !phone) {
    console.error('Usage: tsx scripts/create-user.ts "Name" "+55..." [ADMIN|USER] [dashboardPassword]');
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      name,
      whatsappPhone: phone,
      role: (role as "ADMIN" | "USER") ?? "USER",
      passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
    },
  });

  console.log("Created user:", { ...user, passwordHash: user.passwordHash ? "[set]" : null });
}

main().finally(() => prisma.$disconnect());
