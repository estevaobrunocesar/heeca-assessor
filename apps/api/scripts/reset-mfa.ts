import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Usage: npx tsx scripts/reset-mfa.ts "user@email.com"
// For someone locked out of their own account: they lost the authenticator
// AND the recovery codes, and there is no other admin to reset it from the UI.
async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: tsx scripts/reset-mfa.ts "user@email.com"');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email: email.trim().toLowerCase() },
    data: {
      mfaEnabled: false,
      mfaSecretEnc: null,
      mfaLastStep: null,
      mfaRecoveryHashes: [],
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    },
  });

  console.log(`MFA disabled for ${user.name} (${user.email}). They can sign in with just the password and enroll again.`);
}

main().finally(() => prisma.$disconnect());
