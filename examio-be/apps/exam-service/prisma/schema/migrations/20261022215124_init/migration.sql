-- CreateTable
CREATE TABLE "AIChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "documentId" TEXT,
    "documentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChatDocument" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIChatDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userStorageId" TEXT NOT NULL,
    "pageRange" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    -- Hand-edited: pgvector lives in the shared `extensions` schema (created by the
    -- database init, since service roles cannot CREATE EXTENSION).
    "embeddings" extensions.vector NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DocumentEntity" (
    "id" TEXT NOT NULL,
    "userStorageId" TEXT NOT NULL,
    "chunkId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "relatedNames" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStorageGraph" (
    "id" TEXT NOT NULL,
    "userStorageId" TEXT NOT NULL,
    "graphVersion" INTEGER NOT NULL DEFAULT 1,
    "chunkSignature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "totalEdges" INTEGER NOT NULL DEFAULT 0,
    "totalCommunities" INTEGER NOT NULL DEFAULT 0,
    "totalGroups" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStorageGraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStorageGraphGroup" (
    "id" TEXT NOT NULL,
    "graphId" TEXT NOT NULL,
    "userStorageId" TEXT NOT NULL,
    "groupIndex" INTEGER NOT NULL,
    "communityId" INTEGER,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "pageRanges" JSONB NOT NULL,
    "chunkIds" JSONB NOT NULL,
    "estimatedTokens" INTEGER NOT NULL DEFAULT 0,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStorageGraphGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamRoom" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quizSetId" TEXT NOT NULL,
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
CREATE TABLE "UserPinnedExamRoom" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examRoomId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPinnedExamRoom_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "UserStorage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "keyR2" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" TEXT NOT NULL DEFAULT 'COMPLETED',
    "creditCharged" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "UserMonthlyFileUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMonthlyFileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hostId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "accessType" INTEGER NOT NULL DEFAULT 0,
    "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "playlistAddPermission" INTEGER NOT NULL DEFAULT 1,
    "workMinutes" INTEGER NOT NULL DEFAULT 30,
    "breakMinutes" INTEGER NOT NULL DEFAULT 5,
    "longBreakMinutes" INTEGER NOT NULL DEFAULT 15,
    "cyclesBeforeLongBreak" INTEGER NOT NULL DEFAULT 4,
    "currentMediaUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxParticipants" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "StudyRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyRoomMember" (
    "id" TEXT NOT NULL,
    "studyRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 0,
    "totalFocusSeconds" INTEGER NOT NULL DEFAULT 0,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyRoomPlaylistItem" (
    "id" TEXT NOT NULL,
    "studyRoomId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "addedByUserId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyRoomPlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyRoomChatBlock" (
    "id" TEXT NOT NULL,
    "studyRoomId" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyRoomChatBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFamilyCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordFamilyCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFamily" (
    "id" TEXT NOT NULL,
    "rootWord" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSavedWordFamily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordFamilyId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSavedWordFamily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIChat_userId_updatedAt_idx" ON "AIChat"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AIChat_subjectId_idx" ON "AIChat"("subjectId");

-- CreateIndex
CREATE INDEX "AIChatMessage_chatId_createdAt_idx" ON "AIChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "AIChatDocument_chatId_idx" ON "AIChatDocument"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "AIChatDocument_chatId_documentId_key" ON "AIChatDocument"("chatId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCategory_name_key" ON "SubjectCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCategory_slug_key" ON "SubjectCategory"("slug");

-- CreateIndex
CREATE INDEX "SubjectCategory_isActive_order_idx" ON "SubjectCategory"("isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

-- CreateIndex
CREATE INDEX "Subject_categoryId_isActive_order_idx" ON "Subject"("categoryId", "isActive", "order");

-- CreateIndex
CREATE INDEX "Subject_isActive_order_idx" ON "Subject"("isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Document_id_key" ON "Document"("id");

-- CreateIndex
CREATE INDEX "Document_userStorageId_createdAt_idx" ON "Document"("userStorageId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentEntity_userStorageId_idx" ON "DocumentEntity"("userStorageId");

-- CreateIndex
CREATE INDEX "DocumentEntity_name_type_idx" ON "DocumentEntity"("name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "UserStorageGraph_userStorageId_key" ON "UserStorageGraph"("userStorageId");

-- CreateIndex
CREATE INDEX "UserStorageGraph_status_idx" ON "UserStorageGraph"("status");

-- CreateIndex
CREATE INDEX "UserStorageGraphGroup_userStorageId_groupIndex_idx" ON "UserStorageGraphGroup"("userStorageId", "groupIndex");

-- CreateIndex
CREATE UNIQUE INDEX "UserStorageGraphGroup_graphId_groupIndex_key" ON "UserStorageGraphGroup"("graphId", "groupIndex");

-- CreateIndex
CREATE INDEX "ExamRoom_hostId_idx" ON "ExamRoom"("hostId");

-- CreateIndex
CREATE INDEX "ExamSession_accessCode_idx" ON "ExamSession"("accessCode");

-- CreateIndex
CREATE INDEX "ExamAttempt_userId_idx" ON "ExamAttempt"("userId");

-- CreateIndex
CREATE INDEX "CheatingLog_examAttemptId_idx" ON "CheatingLog"("examAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "CheatingLog_examAttemptId_type_key" ON "CheatingLog"("examAttemptId", "type");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_quizSetId_userId_isSubmitted_idx" ON "QuizPracticeAttempt"("quizSetId", "userId", "isSubmitted");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_userId_idx" ON "QuizPracticeAttempt"("userId");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_quizSetId_idx" ON "QuizPracticeAttempt"("quizSetId");

-- CreateIndex
CREATE INDEX "QuizPracticeAttempt_userId_updatedAt_idx" ON "QuizPracticeAttempt"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "UserPinnedExamRoom_userId_pinnedAt_idx" ON "UserPinnedExamRoom"("userId", "pinnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPinnedExamRoom_userId_examRoomId_key" ON "UserPinnedExamRoom"("userId", "examRoomId");

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
CREATE INDEX "HistoryGeneratedFlashcard_userId_idx" ON "HistoryGeneratedFlashcard"("userId");

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
CREATE UNIQUE INDEX "UserStorage_id_key" ON "UserStorage"("id");

-- CreateIndex
CREATE UNIQUE INDEX "UserStorage_keyR2_key" ON "UserStorage"("keyR2");

-- CreateIndex
CREATE INDEX "UserStorage_userId_idx" ON "UserStorage"("userId");

-- CreateIndex
CREATE INDEX "UserMonthlyFileUpload_userId_yearMonth_idx" ON "UserMonthlyFileUpload"("userId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "UserMonthlyFileUpload_userId_yearMonth_key" ON "UserMonthlyFileUpload"("userId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "StudyRoom_inviteCode_key" ON "StudyRoom"("inviteCode");

-- CreateIndex
CREATE INDEX "StudyRoom_hostId_idx" ON "StudyRoom"("hostId");

-- CreateIndex
CREATE INDEX "StudyRoom_inviteCode_idx" ON "StudyRoom"("inviteCode");

-- CreateIndex
CREATE INDEX "StudyRoomMember_userId_idx" ON "StudyRoomMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyRoomMember_studyRoomId_userId_key" ON "StudyRoomMember"("studyRoomId", "userId");

-- CreateIndex
CREATE INDEX "StudyRoomPlaylistItem_studyRoomId_order_idx" ON "StudyRoomPlaylistItem"("studyRoomId", "order");

-- CreateIndex
CREATE INDEX "StudyRoomChatBlock_studyRoomId_blockerId_idx" ON "StudyRoomChatBlock"("studyRoomId", "blockerId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyRoomChatBlock_studyRoomId_blockerId_blockedId_key" ON "StudyRoomChatBlock"("studyRoomId", "blockerId", "blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "WordFamilyCategory_name_key" ON "WordFamilyCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WordFamilyCategory_slug_key" ON "WordFamilyCategory"("slug");

-- CreateIndex
CREATE INDEX "WordFamilyCategory_isActive_order_idx" ON "WordFamilyCategory"("isActive", "order");

-- CreateIndex
CREATE INDEX "WordFamily_categorySlug_idx" ON "WordFamily"("categorySlug");

-- CreateIndex
CREATE INDEX "WordFamily_categoryId_idx" ON "WordFamily"("categoryId");

-- CreateIndex
CREATE INDEX "WordFamily_rootWord_idx" ON "WordFamily"("rootWord");

-- CreateIndex
CREATE UNIQUE INDEX "WordFamily_rootWord_categorySlug_key" ON "WordFamily"("rootWord", "categorySlug");

-- CreateIndex
CREATE INDEX "UserSavedWordFamily_userId_idx" ON "UserSavedWordFamily"("userId");

-- CreateIndex
CREATE INDEX "UserSavedWordFamily_wordFamilyId_idx" ON "UserSavedWordFamily"("wordFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSavedWordFamily_userId_wordFamilyId_key" ON "UserSavedWordFamily"("userId", "wordFamilyId");

-- AddForeignKey
ALTER TABLE "AIChat" ADD CONSTRAINT "AIChat_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIChatMessage" ADD CONSTRAINT "AIChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AIChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIChatDocument" ADD CONSTRAINT "AIChatDocument_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AIChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIChatDocument" ADD CONSTRAINT "AIChatDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UserStorage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SubjectCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userStorageId_fkey" FOREIGN KEY ("userStorageId") REFERENCES "UserStorage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEntity" ADD CONSTRAINT "DocumentEntity_userStorageId_fkey" FOREIGN KEY ("userStorageId") REFERENCES "UserStorage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStorageGraph" ADD CONSTRAINT "UserStorageGraph_userStorageId_fkey" FOREIGN KEY ("userStorageId") REFERENCES "UserStorage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStorageGraphGroup" ADD CONSTRAINT "UserStorageGraphGroup_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "UserStorageGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStorageGraphGroup" ADD CONSTRAINT "UserStorageGraphGroup_userStorageId_fkey" FOREIGN KEY ("userStorageId") REFERENCES "UserStorage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRoom" ADD CONSTRAINT "ExamRoom_quizSetId_fkey" FOREIGN KEY ("quizSetId") REFERENCES "QuizSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheatingLog" ADD CONSTRAINT "CheatingLog_examAttemptId_fkey" FOREIGN KEY ("examAttemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizPracticeAttempt" ADD CONSTRAINT "QuizPracticeAttempt_quizSetId_fkey" FOREIGN KEY ("quizSetId") REFERENCES "QuizSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedExamRoom" ADD CONSTRAINT "UserPinnedExamRoom_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "HistoryGeneratedQuizz" ADD CONSTRAINT "HistoryGeneratedQuizz_userStorageId_fkey" FOREIGN KEY ("userStorageId") REFERENCES "UserStorage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryGeneratedFlashcard" ADD CONSTRAINT "HistoryGeneratedFlashcard_userStorageId_fkey" FOREIGN KEY ("userStorageId") REFERENCES "UserStorage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashCardViewHistory" ADD CONSTRAINT "FlashCardViewHistory_flashCardSetId_fkey" FOREIGN KEY ("flashCardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedFlashcard" ADD CONSTRAINT "UserPinnedFlashcard_flashcardSetId_fkey" FOREIGN KEY ("flashcardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardStudyProgress" ADD CONSTRAINT "FlashcardStudyProgress_flashCardSetId_fkey" FOREIGN KEY ("flashCardSetId") REFERENCES "FlashCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyRoomMember" ADD CONSTRAINT "StudyRoomMember_studyRoomId_fkey" FOREIGN KEY ("studyRoomId") REFERENCES "StudyRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyRoomPlaylistItem" ADD CONSTRAINT "StudyRoomPlaylistItem_studyRoomId_fkey" FOREIGN KEY ("studyRoomId") REFERENCES "StudyRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFamily" ADD CONSTRAINT "WordFamily_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WordFamilyCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedWordFamily" ADD CONSTRAINT "UserSavedWordFamily_wordFamilyId_fkey" FOREIGN KEY ("wordFamilyId") REFERENCES "WordFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

