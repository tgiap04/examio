-- Phase 15: the document domain moved to document-service (schema `document`) and the vector /
-- entity / graph tables to ai-service (schema `ai`). DB reset policy: the tables are dropped, not
-- copied. `AIChatDocument.documentId` and `HistoryGenerated*.userStorageId` stay as plain columns
-- (no FK: the owner is another service; `document.deleted` removes / nulls them).
-- Adds GenerationJob, the crash-safe charge record of AI generation.

-- DropForeignKey
ALTER TABLE "AIChatDocument" DROP CONSTRAINT "AIChatDocument_documentId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_userStorageId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentEntity" DROP CONSTRAINT "DocumentEntity_userStorageId_fkey";

-- DropForeignKey
ALTER TABLE "HistoryGeneratedFlashcard" DROP CONSTRAINT "HistoryGeneratedFlashcard_userStorageId_fkey";

-- DropForeignKey
ALTER TABLE "HistoryGeneratedQuizz" DROP CONSTRAINT "HistoryGeneratedQuizz_userStorageId_fkey";

-- DropForeignKey
ALTER TABLE "UserStorageGraph" DROP CONSTRAINT "UserStorageGraph_userStorageId_fkey";

-- DropForeignKey
ALTER TABLE "UserStorageGraphGroup" DROP CONSTRAINT "UserStorageGraphGroup_graphId_fkey";

-- DropForeignKey
ALTER TABLE "UserStorageGraphGroup" DROP CONSTRAINT "UserStorageGraphGroup_userStorageId_fkey";

-- DropTable
DROP TABLE "Document";

-- DropTable
DROP TABLE "DocumentEntity";

-- DropTable
DROP TABLE "UserMonthlyFileUpload";

-- DropTable
DROP TABLE "UserStorage";

-- DropTable
DROP TABLE "UserStorageGraph";

-- DropTable
DROP TABLE "UserStorageGraphGroup";

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CHARGE',
    "chargeKey" TEXT NOT NULL,
    "chargedAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "options" JSONB NOT NULL,
    "model" TEXT,
    "error" TEXT,
    "historyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_chargeKey_key" ON "GenerationJob"("chargeKey");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_storageId_createdAt_idx" ON "GenerationJob"("userId", "storageId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GenerationJob_status_createdAt_idx" ON "GenerationJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_refundedAt_idx" ON "GenerationJob"("status", "refundedAt");

-- CreateIndex
CREATE INDEX "AIChatDocument_documentId_idx" ON "AIChatDocument"("documentId");

-- CreateIndex
CREATE INDEX "HistoryGeneratedFlashcard_userStorageId_idx" ON "HistoryGeneratedFlashcard"("userStorageId");

-- CreateIndex
CREATE INDEX "HistoryGeneratedQuizz_userStorageId_idx" ON "HistoryGeneratedQuizz"("userStorageId");

-- Revoke the temporary ai-service grants on this schema (ai-service now owns schema `ai` and no
-- longer touches exam tables). Guarded: the role only exists where the init script created it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_svc') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA exam FROM ai_svc;
        ALTER DEFAULT PRIVILEGES FOR ROLE exam_svc IN SCHEMA exam REVOKE ALL ON TABLES FROM ai_svc;
        REVOKE USAGE ON SCHEMA exam FROM ai_svc;
    END IF;
END
$$;
