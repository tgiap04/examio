-- Add first-touch signup attribution source to User.
-- Additive + nullable: safe to apply on a live table (no default backfill, no
-- data loss). Existing rows get NULL, aggregated as "direct" by admin-stats.
--
-- NOTE: repo deploys schema via `db push`; this hand-written migration mirrors
-- the change for a clean-slate `prisma:deploy`. Apply directly via psql on dev
-- if not using migrate. Independent of the pending money_float_to_int migration.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "utmSource" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "User_utmSource_idx" ON "User" ("utmSource");
