-- DropForeignKey
ALTER TABLE "StudyRoomMember" DROP CONSTRAINT "StudyRoomMember_studyRoomId_fkey";

-- DropForeignKey
ALTER TABLE "StudyRoomPlaylistItem" DROP CONSTRAINT "StudyRoomPlaylistItem_studyRoomId_fkey";

-- DropTable
DROP TABLE "StudyRoom";

-- DropTable
DROP TABLE "StudyRoomChatBlock";

-- DropTable
DROP TABLE "StudyRoomMember";

-- DropTable
DROP TABLE "StudyRoomPlaylistItem";

