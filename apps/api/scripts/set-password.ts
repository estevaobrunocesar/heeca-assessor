import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Usage: npx tsx scripts/set-password.ts "+5511999998888" "newPassword"
async function main() {
  const [phone, password] = process.argv.slice(2);
  if (!phone || !password) {
    console.error('Usage: tsx scripts/set-password.ts "+55..." "password"');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.update({ where: { whatsappPhone: phone }, data: { passwordHash } });

  console.log(`Password set for ${user.name} (${user.whatsappPhone}).`);
}

main().finally(() => prisma.$disconnect());
