-- Vocabulary domain moved to vocabulary-service (own schema `vocabulary`, database-per-service).
-- DB reset policy: the tables are dropped, not copied.

-- DropForeignKey
ALTER TABLE "UserSavedWordFamily" DROP CONSTRAINT "UserSavedWordFamily_wordFamilyId_fkey";

-- DropForeignKey
ALTER TABLE "WordFamily" DROP CONSTRAINT "WordFamily_categoryId_fkey";

-- DropTable
DROP TABLE "UserSavedWordFamily";

-- DropTable
DROP TABLE "WordFamily";

-- DropTable
DROP TABLE "WordFamilyCategory";
