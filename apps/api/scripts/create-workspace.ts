import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDefaultCategories } from "../src/financial/seedCategories";

const prisma = new PrismaClient();

// Usage: npx tsx scripts/create-workspace.ts "Workspace name" "Admin name" "+5511999998888" "password"
async function main() {
  const [workspaceName, adminName, phone, password] = process.argv.slice(2);
  if (!workspaceName || !adminName || !phone || !password) {
    console.error('Usage: tsx scripts/create-workspace.ts "Workspace name" "Admin name" "+55..." "password"');
    process.exit(1);
  }

  const workspace = await prisma.workspace.create({ data: { name: workspaceName } });
  await seedDefaultCategories(workspace.id);

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: adminName,
      whatsappPhone: phone,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  console.log("Created workspace:", workspace);
  console.log("Created admin user:", { ...user, passwordHash: "[set]" });
}

main().finally(() => prisma.$disconnect());
