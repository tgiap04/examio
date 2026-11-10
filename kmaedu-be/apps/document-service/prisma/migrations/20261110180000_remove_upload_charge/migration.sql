-- Contract migration (PR label `migration:contract`): the school edition has no credits and no
-- monthly upload quota. Uploads are inserted PENDING with their `document.uploaded` outbox row; the
-- charge bookkeeping columns, their index and the never-used monthly counter table go.

-- Defensive, for dev databases only (the new stack was never deployed). Run BEFORE the drops,
-- while the charge columns still exist:
-- 1. A row left between insert and debit can no longer be settled by anything: it fails, and
--    EnsureProcessed / a new upload can still re-queue it.
UPDATE "UserStorage" SET "processingStatus" = 'FAILED', "updatedAt" = now() WHERE "processingStatus" = 'PENDING_CHARGE';
-- 2. Rows whose charge was refused or timed out were hidden from their owner; without the
--    `chargeFailedAt` filter they would reappear. Their R2 objects were already queued for deletion
--    (r2_delete_tasks) in the same transaction that set `chargeFailedAt`, so nothing is orphaned.
DELETE FROM "UserStorage" WHERE "chargeFailedAt" IS NOT NULL;

-- DropIndex
DROP INDEX "UserStorage_refundSettledAt_chargeFailedAt_idx";

-- AlterTable
ALTER TABLE "UserStorage" DROP COLUMN "chargeFailedAt",
DROP COLUMN "creditCharged",
DROP COLUMN "refundSettledAt";

-- DropTable
DROP TABLE "UserMonthlyFileUpload";
