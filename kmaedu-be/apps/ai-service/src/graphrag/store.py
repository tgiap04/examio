"""All SQL of the GraphRAG index (asyncpg, parametrized, every query keyed by ``userStorageId``).

``GraphIndex`` is also the work queue: a worker claims a row with ``FOR UPDATE SKIP
LOCKED`` and a lease, and every write that finishes a build is guarded by the
``chunkSignature`` the build started from, so a re-uploaded or deleted document
can never receive a stale graph. Timestamps are UTC ``TIMESTAMP(3)`` (Prisma
convention), computed by the database clock.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import asyncpg

from .types import GraphData

logger = logging.getLogger(__name__)

NOW = "(now() AT TIME ZONE 'UTC')"
MAX_ATTEMPTS = 3
LEASE_MINUTES = 15
BACKOFF_SECONDS = [60, 300, 1800]  # after failure 1, 2, 3
ERROR_CHARS = 500

# Child tables first; the order only matters for readability (no foreign keys).
GRAPH_DATA_TABLES = ("GraphTextUnitEntity", "GraphRelationship", "GraphCommunity", "GraphEntity")
GRAPH_TABLES = (*GRAPH_DATA_TABLES, "GraphIndex")

UPSERT_PENDING_SQL = f"""
INSERT INTO "GraphIndex" ("userStorageId", "chunkSignature", "status")
VALUES ($1, $2, 'PENDING')
ON CONFLICT ("userStorageId") DO UPDATE SET
    "status" = 'PENDING', "attempts" = 0, "leaseUntil" = NULL, "nextAttemptAt" = NULL,
    "error" = NULL, "chunkSignature" = EXCLUDED."chunkSignature", "updatedAt" = {NOW}
WHERE "GraphIndex"."chunkSignature" IS DISTINCT FROM EXCLUDED."chunkSignature"
   OR "GraphIndex"."status" = 'FAILED'
"""

REAP_SQL = f"""
UPDATE "GraphIndex" SET "status" = 'FAILED', "leaseUntil" = NULL, "nextAttemptAt" = NULL,
    "error" = 'lease expired too many times', "updatedAt" = {NOW}
WHERE "status" = 'BUILDING' AND "leaseUntil" < {NOW} AND "attempts" + 1 >= $1
RETURNING "userStorageId"
"""

CLAIM_SQL = f"""
UPDATE "GraphIndex" SET
    "attempts" = CASE WHEN "status" = 'BUILDING' THEN "attempts" + 1 ELSE "attempts" END,
    "status" = 'BUILDING',
    "leaseUntil" = {NOW} + make_interval(mins => $2),
    "updatedAt" = {NOW}
WHERE "userStorageId" = (
    SELECT "userStorageId" FROM "GraphIndex"
    WHERE ("status" = 'PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= {NOW}))
       OR ("status" = 'FAILED' AND "attempts" < $1 AND "nextAttemptAt" <= {NOW})
       OR ("status" = 'BUILDING' AND "leaseUntil" < {NOW} AND "attempts" + 1 < $1)
    ORDER BY "updatedAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING "userStorageId", "chunkSignature", "attempts"
"""

MARK_FAILED_SQL = f"""
UPDATE "GraphIndex" SET "status" = 'FAILED', "attempts" = "attempts" + 1, "leaseUntil" = NULL,
    "nextAttemptAt" = {NOW} + make_interval(secs => ($3::int[])[LEAST("attempts" + 1, cardinality($3::int[]))]),
    "error" = $4, "updatedAt" = {NOW}
WHERE "userStorageId" = $1 AND "chunkSignature" = $2 AND "status" = 'BUILDING'
RETURNING "attempts"
"""

RELEASE_SQL = f"""
UPDATE "GraphIndex" SET "status" = 'PENDING', "leaseUntil" = NULL, "updatedAt" = {NOW},
    "nextAttemptAt" = CASE WHEN $3::int > 0 THEN {NOW} + make_interval(secs => $3::int) ELSE NULL END
WHERE "userStorageId" = $1 AND "chunkSignature" = $2 AND "status" = 'BUILDING'
"""

LOCK_SIGNATURE_SQL = 'SELECT "chunkSignature" FROM "GraphIndex" WHERE "userStorageId" = $1 FOR UPDATE'

MARK_READY_SQL = f"""
UPDATE "GraphIndex" SET "status" = 'READY', "attempts" = 0, "leaseUntil" = NULL, "nextAttemptAt" = NULL,
    "error" = NULL, "stats" = $2::jsonb, "builtAt" = {NOW}, "updatedAt" = {NOW}
WHERE "userStorageId" = $1
"""

INSERT_ENTITY_SQL = """
INSERT INTO "GraphEntity" ("id", "userStorageId", "name", "normName", "type", "description",
                           "descriptionCount", "degree", "rank", "embedding")
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::extensions.vector)
"""
INSERT_COMMUNITY_SQL = """
INSERT INTO "GraphCommunity" ("id", "userStorageId", "level", "communityKey", "parentId", "entityIds", "size",
                              "title", "summary", "findings", "rating", "embedding")
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb, $11, $12::extensions.vector)
"""
INSERT_RELATIONSHIP_SQL = """
INSERT INTO "GraphRelationship" ("id", "userStorageId", "sourceId", "targetId", "description", "weight")
VALUES ($1, $2, $3, $4, $5, $6)
"""
INSERT_LINK_SQL = 'INSERT INTO "GraphTextUnitEntity" ("userStorageId", "chunkId", "entityId") VALUES ($1, $2, $3)'


def vector_literal(vector: list[float] | None) -> str | None:
    """Pgvector text form ``[1.0,2.0]`` (what ``vector_store_pg`` sends); ``None`` stays NULL."""
    return None if vector is None else "[" + ",".join(repr(float(x)) for x in vector) + "]"


@dataclass(frozen=True)
class Claim:
    """A ``GraphIndex`` row this worker now holds the lease on."""

    storage_id: str
    chunk_signature: str
    attempts: int


async def upsert_pending(pool: asyncpg.Pool, storage_id: str, chunk_signature: str) -> None:
    """Queue (re)indexing. No-op while the same chunks are already queued, building or READY."""
    await pool.execute(UPSERT_PENDING_SQL, storage_id, chunk_signature)


async def claim_next(pool: asyncpg.Pool, max_attempts: int = MAX_ATTEMPTS, lease_minutes: int = LEASE_MINUTES) -> Claim | None:
    """Claim one runnable row: PENDING, FAILED past its backoff, or BUILDING past its lease."""
    for reaped in await pool.fetch(REAP_SQL, max_attempts):
        _log_terminal(reaped["userStorageId"], "lease expired too many times")
    row = await pool.fetchrow(CLAIM_SQL, max_attempts, lease_minutes)
    if row is None:
        return None
    return Claim(row["userStorageId"], row["chunkSignature"], row["attempts"])


async def mark_failed(pool: asyncpg.Pool, storage_id: str, chunk_signature: str, error: str) -> bool:
    """FAILED with the next backoff; ``False`` when the row moved on (re-queued, deleted)."""
    attempts = await pool.fetchval(
        MARK_FAILED_SQL, storage_id, chunk_signature, BACKOFF_SECONDS, (error or "unknown error")[:ERROR_CHARS]
    )
    if attempts is not None and attempts >= MAX_ATTEMPTS:
        _log_terminal(storage_id, error)
    return attempts is not None


async def release_lease(pool: asyncpg.Pool, storage_id: str, chunk_signature: str, retry_after_seconds: int = 0) -> bool:
    """Requeue this build's BUILDING row (signature-guarded: never another worker's), after ``retry_after_seconds``."""
    status = await pool.execute(RELEASE_SQL, storage_id, chunk_signature, max(0, retry_after_seconds))
    return status.endswith(" 1")


def _log_terminal(storage_id: str, reason: str | None) -> None:
    logger.error(
        "[GRAPHRAG] index permanently FAILED user_storage_id=%s reason=%s; chat and generation use the vector "
        "fallback until the document is re-uploaded",
        storage_id, (reason or "unknown")[:200],
    )


async def replace_graph(
    pool: asyncpg.Pool, storage_id: str, chunk_signature: str, graph: GraphData, stats: dict[str, Any]
) -> bool:
    """Swap the stored graph for ``graph`` and mark the index READY, in ONE transaction.

    Returns ``False`` (nothing written) when the row is gone or its ``chunkSignature``
    differs from the one this build started from. Any error rolls back and leaves the
    previous graph untouched.
    """
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(LOCK_SIGNATURE_SQL, storage_id)
        if row is None or row["chunkSignature"] != chunk_signature:
            return False
        for table in GRAPH_DATA_TABLES:
            await conn.execute(f'DELETE FROM "{table}" WHERE "userStorageId" = $1', storage_id)
        await conn.executemany(
            INSERT_ENTITY_SQL,
            [
                (e.id, storage_id, e.name, e.norm_name, e.type, e.description, e.description_count, e.degree, e.rank,
                 vector_literal(e.embedding))
                for e in graph.entities
            ],
        )
        await conn.executemany(
            INSERT_RELATIONSHIP_SQL,
            [(r.id, storage_id, r.source_id, r.target_id, r.description, r.weight) for r in graph.relationships],
        )
        await conn.executemany(INSERT_LINK_SQL, [(storage_id, chunk_id, entity_id) for chunk_id, entity_id in graph.links])
        await conn.executemany(
            INSERT_COMMUNITY_SQL,
            [
                (c.id, storage_id, c.level, c.community_key, c.parent_id, json.dumps(c.entity_ids), c.size, c.title, c.summary,
                 json.dumps(c.findings, ensure_ascii=False), c.rating, vector_literal(c.embedding))
                for c in graph.communities
            ],
        )
        await conn.execute(MARK_READY_SQL, storage_id, json.dumps(stats))
    return True


async def delete_for(conn: asyncpg.Connection | asyncpg.Pool, storage_ids: list[str]) -> None:
    """Delete every GraphRAG row of these documents (graph data and the index row)."""
    for table in GRAPH_TABLES:
        await conn.execute(f'DELETE FROM "{table}" WHERE "userStorageId" = ANY($1::text[])', storage_ids)
