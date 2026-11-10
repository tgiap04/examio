-- AlterTable
ALTER TABLE "UserStorage" ADD COLUMN     "refundSettledAt" TIMESTAMP(3);

-- Rows settled before this column existed were refunded inline (or never charged): nothing is owed.
UPDATE "UserStorage" SET "refundSettledAt" = "chargeFailedAt" WHERE "chargeFailedAt" IS NOT NULL;

-- CreateIndex
CREATE INDEX "UserStorage_refundSettledAt_chargeFailedAt_idx" ON "UserStorage"("refundSettledAt", "chargeFailedAt");
