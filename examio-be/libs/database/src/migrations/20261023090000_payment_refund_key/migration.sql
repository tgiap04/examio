-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_refundIdempotencyKey_key" ON "Payment"("refundIdempotencyKey");
