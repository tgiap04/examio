"""GraphRAG tables: per-document entity graph, communities and the index queue.

Additive only: the 0001 tables are untouched (the legacy graph and entity tables
stay until the contract phase). Every row is scoped by ``userStorageId``; there is
no foreign key to ``Document`` (the storage row lives in document-service), so
deletion is by ``userStorageId``. ``embedding`` columns are an unsized
``extensions.vector`` like ``Document.embeddings``; per-document volumes are small
and every query filters ``userStorageId`` first, so no ANN index is created.

``GraphIndex`` doubles as the work queue: ``status`` / ``leaseUntil`` /
``nextAttemptAt`` / ``attempts`` are claimed with ``FOR UPDATE SKIP LOCKED``.
Timestamps hold UTC (Prisma convention), like ``outbox_events``.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-15
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

UTC_NOW = "(now() AT TIME ZONE 'UTC')"

STATEMENTS = [
    f"""
    CREATE TABLE "GraphIndex" (
        "userStorageId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "leaseUntil" TIMESTAMP(3),
        "nextAttemptAt" TIMESTAMP(3),
        "error" TEXT,
        "chunkSignature" TEXT NOT NULL,
        "stats" JSONB,
        "builtAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT {UTC_NOW},
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT {UTC_NOW},
        CONSTRAINT "GraphIndex_pkey" PRIMARY KEY ("userStorageId"),
        CONSTRAINT "GraphIndex_status_check" CHECK ("status" IN ('PENDING', 'BUILDING', 'READY', 'FAILED'))
    )
    """,
    'CREATE INDEX "GraphIndex_status_nextAttemptAt_idx" ON "GraphIndex"("status", "nextAttemptAt")',
    f"""
    CREATE TABLE "GraphEntity" (
        "id" TEXT NOT NULL,
        "userStorageId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "normName" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "descriptionCount" INTEGER NOT NULL DEFAULT 1,
        "embedding" extensions.vector,
        "degree" INTEGER NOT NULL DEFAULT 0,
        "rank" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT {UTC_NOW},
        CONSTRAINT "GraphEntity_pkey" PRIMARY KEY ("id")
    )
    """,
    'CREATE UNIQUE INDEX "GraphEntity_userStorageId_type_normName_key" ON "GraphEntity"("userStorageId", "type", "normName")',
    'CREATE INDEX "GraphEntity_userStorageId_idx" ON "GraphEntity"("userStorageId")',
    """
    CREATE TABLE "GraphRelationship" (
        "id" TEXT NOT NULL,
        "userStorageId" TEXT NOT NULL,
        "sourceId" TEXT NOT NULL,
        "targetId" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
        CONSTRAINT "GraphRelationship_pkey" PRIMARY KEY ("id")
    )
    """,
    'CREATE INDEX "GraphRelationship_userStorageId_idx" ON "GraphRelationship"("userStorageId")',
    'CREATE INDEX "GraphRelationship_sourceId_idx" ON "GraphRelationship"("sourceId")',
    'CREATE INDEX "GraphRelationship_targetId_idx" ON "GraphRelationship"("targetId")',
    """
    CREATE TABLE "GraphTextUnitEntity" (
        "userStorageId" TEXT NOT NULL,
        "chunkId" TEXT NOT NULL,
        "entityId" TEXT NOT NULL,
        CONSTRAINT "GraphTextUnitEntity_pkey" PRIMARY KEY ("chunkId", "entityId")
    )
    """,
    'CREATE INDEX "GraphTextUnitEntity_entityId_idx" ON "GraphTextUnitEntity"("entityId")',
    'CREATE INDEX "GraphTextUnitEntity_userStorageId_idx" ON "GraphTextUnitEntity"("userStorageId")',
    f"""
    CREATE TABLE "GraphCommunity" (
        "id" TEXT NOT NULL,
        "userStorageId" TEXT NOT NULL,
        "level" SMALLINT NOT NULL,
        "communityKey" INTEGER NOT NULL,
        "parentId" TEXT,
        "entityIds" JSONB NOT NULL DEFAULT '[]',
        "size" INTEGER NOT NULL DEFAULT 0,
        "title" TEXT NOT NULL DEFAULT '',
        "summary" TEXT NOT NULL DEFAULT '',
        "findings" JSONB NOT NULL DEFAULT '[]',
        "rating" DOUBLE PRECISION,
        "embedding" extensions.vector,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT {UTC_NOW},
        CONSTRAINT "GraphCommunity_pkey" PRIMARY KEY ("id")
    )
    """,
    'CREATE INDEX "GraphCommunity_userStorageId_level_idx" ON "GraphCommunity"("userStorageId", "level")',
]

# Only the tables this revision creates (indexes go with them).
TABLES = [
    "GraphCommunity",
    "GraphTextUnitEntity",
    "GraphRelationship",
    "GraphEntity",
    "GraphIndex",
]


def upgrade() -> None:
    """Create the GraphRAG tables."""
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    """Drop the GraphRAG tables; 0001 tables and their data are untouched."""
    for table in TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}"')
