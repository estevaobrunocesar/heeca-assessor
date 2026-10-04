-- CreateTable
CREATE TABLE "StoredAudio" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredAudio_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AiInteractionLog" ADD COLUMN "audioId" TEXT;

-- AddForeignKey
ALTER TABLE "StoredAudio" ADD CONSTRAINT "StoredAudio_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionLog" ADD CONSTRAINT "AiInteractionLog_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "StoredAudio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
