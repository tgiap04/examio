"""Drop the legacy chunk-graph and entity tables that GraphRAG (0002) replaced.

``DocumentEntity``, ``UserStorageGraph`` and ``UserStorageGraphGroup`` have no reader
or writer since the hybrid retrieval and the old entity extraction were removed.
This is a contract migration (label ``migration:contract``). ``downgrade()`` restores
the 0001 DDL unchanged, with empty tables: the dropped rows are not recoverable.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-15
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

# Group rows reference the graph (FK), so they go first.
TABLES = ("UserStorageGraphGroup", "UserStorageGraph", "DocumentEntity")

# Verbatim from 0001_init.py, in the order 0001 created them.
LEGACY_DDL = [
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
]


def upgrade() -> None:
    """Drop the legacy tables."""
    for table in TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}"')


def downgrade() -> None:
    """Recreate the legacy tables (empty) exactly as 0001 defined them."""
    for statement in LEGACY_DDL:
        op.execute(statement)
