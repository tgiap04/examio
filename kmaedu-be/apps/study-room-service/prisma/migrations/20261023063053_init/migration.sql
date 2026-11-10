-- CreateTable
CREATE TABLE "processed_events" (
    "consumer" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer","event_id")
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

-- CreateIndex
CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at");

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

-- AddForeignKey
ALTER TABLE "StudyRoomMember" ADD CONSTRAINT "StudyRoomMember_studyRoomId_fkey" FOREIGN KEY ("studyRoomId") REFERENCES "StudyRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyRoomPlaylistItem" ADD CONSTRAINT "StudyRoomPlaylistItem_studyRoomId_fkey" FOREIGN KEY ("studyRoomId") REFERENCES "StudyRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

