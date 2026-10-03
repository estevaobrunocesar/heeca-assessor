-- AlterTable
ALTER TABLE "SavingsGoal" ADD COLUMN "lastAlertKey" TEXT,
ADD COLUMN "lastAlertAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "goalAlertsEmail" BOOLEAN NOT NULL DEFAULT true;
