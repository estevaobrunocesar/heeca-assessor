-- CreateEnum
CREATE TYPE "ReportEmailFrequency" AS ENUM ('NONE', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "reportEmailFrequency" "ReportEmailFrequency" NOT NULL DEFAULT 'NONE',
ADD COLUMN "reportEmailLastKey" TEXT;
