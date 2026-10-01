import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Adds a user into an EXISTING workspace, identified by any other user
// already in that workspace. For creating a brand-new, isolated tenant use
// scripts/create-workspace.ts instead.
// Usage: npx tsx scripts/create-user.ts "Name" "+5511999998888" "email@x.com" ADMIN "password" "+5511888887777"
//   (last arg: WhatsApp phone of an existing user in the target workspace)
async function main() {
  const [name, phone, email, role, password, existingWorkspaceMemberPhone] = process.argv.slice(2);
  if (!name || !phone || !email || !existingWorkspaceMemberPhone) {
    console.error(
      'Usage: tsx scripts/create-user.ts "Name" "+55..." "email@x.com" [ADMIN|USER] [password] "+55<existing-workspace-member-phone>"',
    );
    process.exit(1);
  }

  const existingMember = await prisma.user.findUnique({ where: { whatsappPhone: existingWorkspaceMemberPhone } });
  if (!existingMember) {
    console.error(`No existing user found with phone ${existingWorkspaceMemberPhone}`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      workspaceId: existingMember.workspaceId,
      name,
      whatsappPhone: phone,
      email: email.trim().toLowerCase(),
      role: (role as "ADMIN" | "USER") ?? "USER",
      passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
    },
  });

  console.log("Created user:", { ...user, passwordHash: user.passwordHash ? "[set]" : null });
}

main().finally(() => prisma.$disconnect());
