-- Expand-safe: additive changes plus the allowed DROPs.
CREATE TABLE "Widget" ("id" TEXT NOT NULL, CONSTRAINT "Widget_pkey" PRIMARY KEY ("id"));
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;
ALTER TABLE "User" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'free', ADD COLUMN "note" TEXT;
CREATE INDEX "User_nickname_idx" ON "User"("nickname");
DROP INDEX "User_old_idx";
alter table "User" alter column "tier" drop default;
ALTER TABLE "User" ALTER COLUMN "legacy" DROP NOT NULL;
ALTER TABLE "User" DROP CONSTRAINT "User_old_fkey";
-- DROP COLUMN "ignored" in a comment is not a statement
