-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "slug" TEXT,
ADD COLUMN "heecaSubscriptionId" TEXT,
ADD COLUMN "heecaAccountId" TEXT,
ADD COLUMN "heecaPlan" TEXT,
ADD COLUMN "heecaStatus" TEXT,
ADD COLUMN "heecaBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "heecaWarning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "heecaMaxUsers" INTEGER,
ADD COLUMN "heecaTrialEndsAt" TIMESTAMP(3),
ADD COLUMN "heecaPeriodEnd" TIMESTAMP(3),
ADD COLUMN "heecaSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_heecaSubscriptionId_key" ON "Workspace"("heecaSubscriptionId");
