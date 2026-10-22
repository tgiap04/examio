-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "balanceAfter" INTEGER,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_walletId_idempotencyKey_key" ON "WalletTransaction"("walletId", "idempotencyKey");
