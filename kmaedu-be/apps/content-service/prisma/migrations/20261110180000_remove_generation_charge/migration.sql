-- Contract migration (PR label `migration:contract`): the school edition has no credits, so a
-- generation job is never charged. Jobs are inserted QUEUED with their outbox row; the charge
-- bookkeeping columns and their indexes go.

-- Defensive, for dev databases only (the new stack was never deployed): a job left between insert
-- and debit can no longer be settled by anything, so it is cancelled before its state disappears.
UPDATE "GenerationJob" SET "status" = 'CANCELLED', "updatedAt" = now() WHERE "status" = 'PENDING_CHARGE';

-- DropIndex
DROP INDEX "GenerationJob_chargeKey_key";

-- DropIndex
DROP INDEX "GenerationJob_status_refundedAt_idx";

-- AlterTable
ALTER TABLE "GenerationJob" DROP COLUMN "chargeKey",
DROP COLUMN "chargedAmount",
DROP COLUMN "refundedAt",
ALTER COLUMN "status" SET DEFAULT 'QUEUED';
