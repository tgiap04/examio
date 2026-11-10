"""Baseline for schema ``ai``: vectors, entities, graph state, outbox, ledger.

Hand-written DDL that mirrors the tables the exam-service used to own
(Document, DocumentEntity, UserStorageGraph, UserStorageGraphGroup). Columns and
indexes are unchanged so existing queries keep working. ``userStorageId`` stays a
plain column: the UserStorage row now lives in document-service, so there is no
foreign key. ``outbox_events`` / ``processed_events`` match libs/messaging.

Revision ID: 0001
Revises:
Create Date: 2026-10-24
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Statements run on the connection whose search_path is "ai,extensions"; the
# vector type is schema-qualified because pgvector lives in "extensions".
STATEMENTS = [
    """
    CREATE TABLE "Document" (
        "id" TEXT NOT NULL,
        "userStorageId" TEXT NOT NULL,
        "pageRange" TEXT NOT NULL,
        "title" TEXT,
        "content" TEXT NOT NULL,
        "embeddings" extensions.vector NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
    )
    """,
    'CREATE INDEX "Document_userStorageId_createdAt_idx" ON "Document"("userStorageId", "createdAt")',
    """
    CREATE TABLE "DocumentEntity" (
        "id" TEXT NOT NULL,
        "userStorageId" TEXT NOT NULL,
        "chunkId" TEXT,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "relatedNames" JSONB NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DocumentEntity_pkey" PRIMARY KEY ("id")
    )
    """,
    'CREATE INDEX "DocumentEntity_userStorageId_idx" ON "DocumentEntity"("userStorageId")',
    'CREATE INDEX "DocumentEntity_name_type_idx" ON "DocumentEntity"("name", "type")',
    """
    CREATE TABLE "UserStorageGraph" (
        "id" TEXT NOT NULL,
        "userStorageId" TEXT NOT NULL,
        "graphVersion" INTEGER NOT NULL DEFAULT 1,
        "chunkSignature" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'READY',
        "totalChunks" INTEGER NOT NULL DEFAULT 0,
        "totalEdges" INTEGER NOT NULL DEFAULT 0,
        "totalCommunities" INTEGER NOT NULL DEFAULT 0,
        "totalGroups" INTEGER NOT NULL DEFAULT 0,
        "metadata" JSONB,
        "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserStorageGraph_pkey" PRIMARY KEY ("id")
    )
    """,
    'CREATE UNIQUE INDEX "UserStorageGraph_userStorageId_key" ON "UserStorageGraph"("userStorageId")',
    'CREATE INDEX "UserStorageGraph_status_idx" ON "UserStorageGraph"("status")',
    """
    CREATE TABLE "UserStorageGraphGroup" (
        "id" TEXT NOT NULL,
        "graphId" TEXT NOT NULL,
        "userStorageId" TEXT NOT NULL,
        "groupIndex" INTEGER NOT NULL,
        "communityId" INTEGER,
        "pageStart" INTEGER,
        "pageEnd" INTEGER,
        "pageRanges" JSONB NOT NULL,
        "chunkIds" JSONB NOT NULL,
        "estimatedTokens" INTEGER NOT NULL DEFAULT 0,
        "charCount" INTEGER NOT NULL DEFAULT 0,
        "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
        "summary" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserStorageGraphGroup_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UserStorageGraphGroup_graphId_fkey" FOREIGN KEY ("graphId")
            REFERENCES "UserStorageGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
    """,
    'CREATE UNIQUE INDEX "UserStorageGraphGroup_graphId_groupIndex_key" ON "UserStorageGraphGroup"("graphId", "groupIndex")',
    'CREATE INDEX "UserStorageGraphGroup_userStorageId_groupIndex_idx" ON "UserStorageGraphGroup"("userStorageId", "groupIndex")',
    # Transactional outbox + idempotent-consumer ledger (same shape as libs/messaging).
    """
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
    )
    """,
    'CREATE UNIQUE INDEX "outbox_events_id_key" ON "outbox_events"("id")',
    # The relay only scans unpublished rows, so the index stays tiny.
    'CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events"("source", "next_attempt_at", "seq") WHERE "published_at" IS NULL',
    """
    CREATE TABLE "processed_events" (
        "consumer" TEXT NOT NULL,
        "event_id" TEXT NOT NULL,
        "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
    )
    """,
    'CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at")',
]

TABLES = [
    "processed_events",
    "outbox_events",
    "UserStorageGraphGroup",
    "UserStorageGraph",
    "DocumentEntity",
    "Document",
]


def upgrade() -> None:
    """Create the ai schema tables."""
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    """Drop the ai schema tables."""
    for table in TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}"')
