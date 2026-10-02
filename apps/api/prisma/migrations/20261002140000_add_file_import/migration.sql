-- AlterEnum
ALTER TYPE "TransactionOrigin" ADD VALUE 'WHATSAPP_FILE';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importBatchId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_importBatchId_idx" ON "Transaction"("importBatchId");
