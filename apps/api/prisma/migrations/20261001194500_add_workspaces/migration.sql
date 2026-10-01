-- Introduce per-tenant isolation: every account/category/transaction now
-- belongs to exactly one Workspace, and nothing is ever queried across
-- workspaces. Existing financial data predates this isolation and is
-- entangled across the system's two current users (shared account/category
-- rows), so there is no safe automatic way to split it — it is wiped here.
-- Users are preserved and assigned to their own new workspace.

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- Bootstrap the two workspaces for this deployment's existing users.
INSERT INTO "Workspace" ("id", "name") VALUES
  ('6847849e-2704-4840-828d-24f40af3bd23', 'Bruno'),
  ('aa18d1da-3912-4619-bcbf-d012c8aa012e', 'Marília')
ON CONFLICT DO NOTHING;

-- AlterTable User: add nullable workspaceId, backfill by known phone number,
-- fall back to Bruno's workspace for any other existing user (e.g. on a
-- fresh/local database with different seed data), then enforce NOT NULL.
ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT;

UPDATE "User" SET "workspaceId" = '6847849e-2704-4840-828d-24f40af3bd23' WHERE "whatsappPhone" = '+5511991469251';
UPDATE "User" SET "workspaceId" = 'aa18d1da-3912-4619-bcbf-d012c8aa012e' WHERE "whatsappPhone" = '+5511971244487';
UPDATE "User" SET "workspaceId" = '6847849e-2704-4840-828d-24f40af3bd23' WHERE "workspaceId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Wipe financial data created before workspace isolation existed.
DELETE FROM "AiInteractionLog";
DELETE FROM "Transaction";
DELETE FROM "Account";
DELETE FROM "Category";

-- AlterTable Category (table is now empty, so NOT NULL needs no default/backfill)
ALTER TABLE "Category" ADD COLUMN "workspaceId" TEXT NOT NULL;
ALTER TABLE "Category" ADD CONSTRAINT "Category_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "Category_name_parentId_key";
CREATE UNIQUE INDEX "Category_workspaceId_name_parentId_key" ON "Category"("workspaceId", "name", "parentId");

-- AlterTable Account
ALTER TABLE "Account" ADD COLUMN "workspaceId" TEXT NOT NULL;
ALTER TABLE "Account" ADD CONSTRAINT "Account_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable Transaction
ALTER TABLE "Transaction" ADD COLUMN "workspaceId" TEXT NOT NULL;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable AiInteractionLog (workspaceId stays nullable, matching the schema)
ALTER TABLE "AiInteractionLog" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AiInteractionLog" ADD CONSTRAINT "AiInteractionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
