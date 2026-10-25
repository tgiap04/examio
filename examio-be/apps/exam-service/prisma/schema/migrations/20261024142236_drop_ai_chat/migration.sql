-- AI chat and subjects moved to ai-chat-service (own schema `aichat`, database-per-service).
-- DB reset policy: the tables are dropped, not copied. Message images on R2 were never deleted with
-- their rows before this phase, so there is nothing to queue here.

-- DropForeignKey
ALTER TABLE "AIChat" DROP CONSTRAINT "AIChat_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "AIChatDocument" DROP CONSTRAINT "AIChatDocument_chatId_fkey";

-- DropForeignKey
ALTER TABLE "AIChatMessage" DROP CONSTRAINT "AIChatMessage_chatId_fkey";

-- DropForeignKey
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_categoryId_fkey";

-- DropTable
DROP TABLE "AIChat";

-- DropTable
DROP TABLE "AIChatDocument";

-- DropTable
DROP TABLE "AIChatMessage";

-- DropTable
DROP TABLE "Subject";

-- DropTable
DROP TABLE "SubjectCategory";

