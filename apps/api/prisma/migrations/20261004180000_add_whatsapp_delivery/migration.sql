-- CreateTable
CREATE TABLE "WhatsappDelivery" (
    "id" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "workspaceId" TEXT,
    "toPhone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappDelivery_sid_key" ON "WhatsappDelivery"("sid");

-- CreateIndex
CREATE INDEX "WhatsappDelivery_workspaceId_createdAt_idx" ON "WhatsappDelivery"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsappDelivery" ADD CONSTRAINT "WhatsappDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
