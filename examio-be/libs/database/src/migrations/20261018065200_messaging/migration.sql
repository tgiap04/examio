-- CreateTable
CREATE TABLE "outbox_events" (
    "seq" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "consumer" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer","event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_id_key" ON "outbox_events"("id");

-- CreateIndex
-- Hand-edited: partial index. The relay only ever scans unpublished rows, so
-- the index stays tiny however many published rows await the daily purge.
-- Not declared in schema.prisma (Prisma cannot express partial indexes and
-- ignores them in `migrate diff`).
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events"("source", "next_attempt_at", "seq") WHERE "published_at" IS NULL;

-- CreateIndex
CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at");
