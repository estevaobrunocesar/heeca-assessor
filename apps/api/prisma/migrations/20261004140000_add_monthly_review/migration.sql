-- AlterTable
ALTER TABLE "User" ADD COLUMN "monthlyReviewEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "monthlyReviewLastKey" TEXT;
