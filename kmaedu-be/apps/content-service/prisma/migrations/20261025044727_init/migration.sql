-- CreateTable
CREATE TABLE "outbox_events" (
    "seq" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "consumer" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer","event_id")
);

-- CreateTable
CREATE TABLE "r2_delete_tasks" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "r2_delete_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizSet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "thumbnail" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessCode" TEXT,
    "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "codeGrantedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "QuizSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizSetLabel" (
    "id" TEXT NOT NULL,
    "quizSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizSetLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashCardSetLabel" (
    "id" TEXT NOT NULL,
    "flashCardSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashCardSetLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashCardSet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "thumbnail" TEXT,
    "description" TEXT,
    "tag" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "accessCode" TEXT,
    "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "codeGrantedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashCardSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetailsQuizQuestion" (
    "id" TEXT NOT NULL,
    "quizSetId" TEXT NOT NULL,
    "quizQuestionId" TEXT NOT NULL,
    "historyGeneratedQuizzId" TEXT,
    "labelId" TEXT,

    CONSTRAINT "DetailsQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashCard" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetailsFlashCard" (
    "id" TEXT NOT NULL,
    "flashCardSetId" TEXT NOT NULL,
    "flashCardId" TEXT NOT NULL,
    "historyGeneratedFlashcardId" TEXT,
    "labelId" TEXT,

    CONSTRAINT "DetailsFlashCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryGeneratedQuizz" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userStorageId" TEXT,
    "quizzes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryGeneratedQuizz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryGeneratedFlashcard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userStorageId" TEXT,
    "flashcards" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryGeneratedFlashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashCardViewHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flashCardSetId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashCardViewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPinnedFlashcard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flashcardSetId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPinnedFlashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardStudyProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flashCardSetId" TEXT NOT NULL,
    "studiedCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalCards" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardStudyProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizPracticeAttempt" (
    "id" TEXT NOT NULL,
    "quizSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "markedQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "timeLimitMinutes" INTEGER,
    "isSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "resultSnapshot" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "QuizPracticeAttempt_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "outbox_events_id_key" ON "outbox_events"("id");

-- CreateIndex
-- Hand-edited: partial index. The relay only ever scans unpublished rows, so
-- the index stays tiny however many published rows await the daily purge.
-- Not declared in schema.prisma (Prisma cannot express partial indexes and
-- ignores them in `migrate diff`).
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events"("source", "next_attempt_at", "seq") WHERE "published_at" IS NULL;

-- CreateIndex
CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at");

-- CreateIndex
CREATE INDEX "r2_delete_tasks_next_attempt_at_idx" ON "r2_delete_tasks"("next_attempt_at");

-- CreateIndex
CREATE INDEX "QuizSet_whitelist_idx" ON "QuizSet" USING GIN ("whitelist");

-- CreateIndex
CREATE INDEX "QuizSet_codeGrantedIds_idx" ON "QuizSet" USING GIN ("codeGrantedIds");

-- CreateIndex
CREATE INDEX "QuizSet_userId_idx" ON "QuizSet"("userId");

-- CreateIndex
CREATE INDEX "QuizSetLabel_quizSetId_idx" ON "QuizSetLabel"("quizSetId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizSetLabel_quizSetId_name_key" ON "QuizSetLabel"("quizSetId", "name");

-- CreateIndex
CREATE INDEX "FlashCardSetLabel_flashCardSetId_idx" ON "FlashCardSetLabel"("flashCardSetId");

-- CreateIndex
CREATE UNIQUE INDEX "FlashCardSetLabel_flashCardSetId_name_key" ON "FlashCardSetLabel"("flashCardSetId", "name");

-- CreateIndex
CREATE INDEX "FlashCardSet_accessCode_idx" ON "FlashCardSet"("accessCode");

-- CreateIndex
CREATE INDEX "FlashCardSet_userId_idx" ON "FlashCardSet"("userId");

-- CreateIndex
CREATE INDEX "DetailsQuizQuestion_quizSetId_idx" ON "DetailsQuizQuestion"("quizSetId");

-- CreateIndex
CREATE INDEX "DetailsQuizQuestion_quizQuestionId_idx" ON "DetailsQuizQuestion"("quizQuestionId");

-- CreateIndex
CREATE INDEX "DetailsQuizQuestion_historyGeneratedQuizzId_idx" ON "DetailsQuizQuestion"("historyGeneratedQuizzId");

-- CreateIndex
CREATE INDEX "DetailsQuizQuestion_labelId_idx" ON "DetailsQuizQuestion"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "DetailsQuizQuestion_quizSetId_quizQuestionId_key" ON "DetailsQuizQuestion"("quizSetId", "quizQuestionId");

-- CreateIndex
CREATE INDEX "DetailsFlashCard_flashCardSetId_idx" ON "DetailsFlashCard"("flashCardSetId");

-- CreateIndex
CREATE INDEX "DetailsFlashCard_flashCardId_idx" ON "DetailsFlashCard"("flashCardId");

-- CreateIndex
CREATE INDEX "DetailsFlashCard_historyGeneratedFlashcardId_idx" ON "DetailsFlashCard"("historyGeneratedFlashcardId");

-- CreateIndex
CREATE INDEX "DetailsFlashCard_labelId_idx" ON "DetailsFlashCard"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "DetailsFlashCard_flashCardSetId_flashCardId_key" ON "DetailsFlashCard"("flashCardSetId", "flashCardId");

-- CreateIndex
CREATE INDEX "HistoryGeneratedQuizz_userId_idx" ON "HistoryGeneratedQuizz"("userId");

-- CreateIndex
CREATE INDEX "HistoryGeneratedQuizz_userStorageId_idx" ON "HistoryGeneratedQuizz"("userStorageId");

-- CreateIndex
CREATE INDEX "HistoryGeneratedFlashcard_userId_idx" ON "HistoryGeneratedFlashcard"("userId");

-- CreateIndex
CREATE INDEX "HistoryGeneratedFlashcard_userStorageId_idx" ON "HistoryGeneratedFlashcard"("userStorageId");

-- CreateIndex
CREATE INDEX "FlashCardViewHistory_userId_viewedAt_idx" ON "FlashCardViewHistory"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "FlashCardViewHistory_flashCardSetId_idx" ON "FlashCardViewHistory"("flashCardSetId");

-- CreateIndex
CREATE INDEX "UserPinnedFlashcard_userId_pinnedAt_idx" ON "UserPinnedFlashcard"("userId", "pinnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPinnedFlashcard_userId_flashcardSetId_key" ON "UserPinnedFlashcard"("userId", "flashcardSetId");

-- CreateIndex
CREATE INDEX "FlashcardStudyProgress_userId_idx" ON "FlashcardStudyProgress"("userId");

-- CreateIndex
CREATE INDEX "FlashcardStudyProgress_flashCardSetId_idx" ON "FlashcardStudyProgress"("flashCardSetId");

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardStudyProgress_userId_flashCardSetId_key" ON "FlashcardStudyProgress"("userId", "flashCardSetId");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_quizSetId_userId_isSubmitted_idx" ON "QuizPracticeAttempt"("quizSetId", "userId", "isSubmitted");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_userId_idx" ON "QuizPracticeAttempt"("userId");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_quizSetId_idx" ON "QuizPracticeAttempt"("quizSetId");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_userId_updatedAt_idx" ON "QuizPracticeAttempt"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_chargeKey_key" ON "GenerationJob"("chargeKey");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_storageId_createdAt_idx" ON "GenerationJob"("userId", "storageId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GenerationJob_status_createdAt_idx" ON "GenerationJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_refundedAt_idx" ON "GenerationJob"("status", "refundedAt");

-- AddForeignKey
ALTER TABLE "QuizSetLabel" ADD CONSTRAINT "QuizSetLabel_quizSetId_fkey" FOREIGN KEY ("quizSetId") REFERENCES "QuizSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashCardSetLabel" ADD CONSTRAINT "FlashCardSetLabel_flashCardSetId_fkey" FOREIGN KEY ("flashCardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsQuizQuestion" ADD CONSTRAINT "DetailsQuizQuestion_quizSetId_fkey" FOREIGN KEY ("quizSetId") REFERENCES "QuizSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsQuizQuestion" ADD CONSTRAINT "DetailsQuizQuestion_quizQuestionId_fkey" FOREIGN KEY ("quizQuestionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsQuizQuestion" ADD CONSTRAINT "DetailsQuizQuestion_historyGeneratedQuizzId_fkey" FOREIGN KEY ("historyGeneratedQuizzId") REFERENCES "HistoryGeneratedQuizz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsQuizQuestion" ADD CONSTRAINT "DetailsQuizQuestion_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "QuizSetLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsFlashCard" ADD CONSTRAINT "DetailsFlashCard_flashCardSetId_fkey" FOREIGN KEY ("flashCardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsFlashCard" ADD CONSTRAINT "DetailsFlashCard_flashCardId_fkey" FOREIGN KEY ("flashCardId") REFERENCES "FlashCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsFlashCard" ADD CONSTRAINT "DetailsFlashCard_historyGeneratedFlashcardId_fkey" FOREIGN KEY ("historyGeneratedFlashcardId") REFERENCES "HistoryGeneratedFlashcard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailsFlashCard" ADD CONSTRAINT "DetailsFlashCard_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "FlashCardSetLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashCardViewHistory" ADD CONSTRAINT "FlashCardViewHistory_flashCardSetId_fkey" FOREIGN KEY ("flashCardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedFlashcard" ADD CONSTRAINT "UserPinnedFlashcard_flashcardSetId_fkey" FOREIGN KEY ("flashcardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardStudyProgress" ADD CONSTRAINT "FlashcardStudyProgress_flashCardSetId_fkey" FOREIGN KEY ("flashCardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizPracticeAttempt" ADD CONSTRAINT "QuizPracticeAttempt_quizSetId_fkey" FOREIGN KEY ("quizSetId") REFERENCES "QuizSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

