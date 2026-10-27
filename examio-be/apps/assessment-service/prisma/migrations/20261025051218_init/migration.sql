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
CREATE TABLE "ExamRoom" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quizSetId" TEXT NOT NULL,
    "quizSetTitle" TEXT NOT NULL DEFAULT '',
    "sourceDeleted" BOOLEAN NOT NULL DEFAULT false,
    "hostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "ExamRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "examRoomId" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "timeLimitMinutes" INTEGER,
    "autoJoinByLink" BOOLEAN NOT NULL DEFAULT false,
    "assessType" INTEGER NOT NULL DEFAULT 0,
    "allowRetake" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "accessCode" TEXT,
    "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "codeGrantedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showAnswersAfterSubmit" BOOLEAN NOT NULL DEFAULT true,
    "passingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quizSnapshot" JSONB NOT NULL,
    "quizSnapshotHash" TEXT NOT NULL,
    "questionCount" INTEGER,
    "questionSelectionMode" INTEGER NOT NULL DEFAULT 0,
    "labelQuestionConfig" JSONB,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "markedQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "selectedQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheatingLog" (
    "id" TEXT NOT NULL,
    "examAttemptId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheatingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPinnedExamRoom" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examRoomId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPinnedExamRoom_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "ExamRoom_hostId_idx" ON "ExamRoom"("hostId");

-- CreateIndex
CREATE INDEX "ExamRoom_quizSetId_idx" ON "ExamRoom"("quizSetId");

-- CreateIndex
CREATE INDEX "ExamSession_accessCode_idx" ON "ExamSession"("accessCode");

-- CreateIndex
CREATE INDEX "ExamSession_examRoomId_idx" ON "ExamSession"("examRoomId");

-- CreateIndex
CREATE INDEX "ExamAttempt_userId_idx" ON "ExamAttempt"("userId");

-- CreateIndex
CREATE INDEX "ExamAttempt_examSessionId_userId_idx" ON "ExamAttempt"("examSessionId", "userId");

-- CreateIndex
CREATE INDEX "CheatingLog_examAttemptId_idx" ON "CheatingLog"("examAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "CheatingLog_examAttemptId_type_key" ON "CheatingLog"("examAttemptId", "type");

-- CreateIndex
CREATE INDEX "UserPinnedExamRoom_userId_pinnedAt_idx" ON "UserPinnedExamRoom"("userId", "pinnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPinnedExamRoom_userId_examRoomId_key" ON "UserPinnedExamRoom"("userId", "examRoomId");

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheatingLog" ADD CONSTRAINT "CheatingLog_examAttemptId_fkey" FOREIGN KEY ("examAttemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedExamRoom" ADD CONSTRAINT "UserPinnedExamRoom_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

