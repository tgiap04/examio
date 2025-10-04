-- Convert monetary columns from double precision (Float) to integer (Int).
-- VND (Vietnamese dong) has no minor unit / decimal subdivision, so every
-- existing stored value is already a whole number and casts losslessly via
-- ROUND(...)::integer. This migration only affects Payment.amount,
-- Wallet.balance, and WalletTransaction.amount.
--
-- NOTE: This migration has NOT been applied to any database. Review it, then
-- run `yarn prisma:deploy` (or `prisma migrate resolve` if applying manually)
-- to apply it against the target database.

ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::integer;

ALTER TABLE "Wallet" ALTER COLUMN "balance" TYPE INTEGER USING ROUND("balance")::integer;

ALTER TABLE "WalletTransaction" ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::integer;
