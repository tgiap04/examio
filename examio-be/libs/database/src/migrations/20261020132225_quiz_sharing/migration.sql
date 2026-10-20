-- DropIndex
DROP INDEX "QuizPracticeAttempt_quizSetId_userId_type_key";

-- AlterTable
ALTER TABLE "ExamSession" ADD COLUMN     "codeGrantedIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "FlashCardSet" ADD COLUMN     "codeGrantedIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "QuizPracticeAttempt" ADD COLUMN     "resultSnapshot" JSONB;

-- AlterTable
ALTER TABLE "QuizSet" ADD COLUMN     "accessCode" TEXT,
ADD COLUMN     "codeGrantedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_quizSetId_userId_isSubmitted_idx" ON "QuizPracticeAttempt"("quizSetId", "userId", "isSubmitted");

-- CreateIndex
CREATE INDEX "QuizSet_whitelist_idx" ON "QuizSet" USING GIN ("whitelist");

-- CreateIndex
CREATE INDEX "QuizSet_codeGrantedIds_idx" ON "QuizSet" USING GIN ("codeGrantedIds");
