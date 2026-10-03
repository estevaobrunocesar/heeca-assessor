-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastWhatsappAt" TIMESTAMP(3),
ADD COLUMN "weeklyWhatsappSummary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "weeklyWhatsappLastKey" TEXT;
