/*
  Warnings:

  - You are about to drop the column `isAdmin` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "BaseRole" AS ENUM ('STUDENT', 'TEACHER');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isAdmin",
ADD COLUMN     "authzVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "BaseRole" NOT NULL DEFAULT 'STUDENT';

-- CreateTable
CREATE TABLE "RoleChangeLog" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "fromRole" "BaseRole" NOT NULL,
    "toRole" "BaseRole" NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL,
    "toAdmin" BOOLEAN NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleChangeLog_targetUserId_createdAt_idx" ON "RoleChangeLog"("targetUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RoleChangeLog_createdAt_idx" ON "RoleChangeLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isSystemAdmin_idx" ON "User"("isSystemAdmin");
