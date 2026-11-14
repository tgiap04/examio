"""Read helpers shared by GraphRAG chat search and generation planning.

Every query is scoped to one ``userStorageId``; callers already checked ownership
upstream (ai-chat / content), so nothing here crosses documents.
"""

from __future__ import annotations

import asyncpg

from .store import vector_literal
from .types import EntityHit, TextUnitHit

__all__ = ["EntityHit", "TextUnitHit", "index_status", "text_units_for_entities", "top_entities_by_vector"]

INDEX_STATUS_SQL = 'SELECT "status" FROM "GraphIndex" WHERE "userStorageId" = $1'

TOP_ENTITIES_SQL = """
SELECT id, name, type, description, rank, embedding <=> $2::extensions.vector AS distance
FROM "GraphEntity"
WHERE "userStorageId" = $1 AND embedding IS NOT NULL
ORDER BY distance, rank DESC, id
LIMIT $3
"""

TEXT_UNITS_SQL = """
SELECT d.id, d."pageRange", d.content, count(*)::int AS matched
FROM "GraphTextUnitEntity" l
JOIN "Document" d ON d.id = l."chunkId" AND d."userStorageId" = l."userStorageId"
WHERE l."userStorageId" = $1 AND l."entityId" = ANY($2::text[])
GROUP BY d.id, d."pageRange", d.content, d."createdAt"
ORDER BY matched DESC, d."createdAt", d.id
LIMIT $3
"""


async def index_status(pool: asyncpg.Pool, storage_id: str) -> str | None:
    """Return the ``GraphIndex`` status (PENDING/BUILDING/READY/FAILED), or ``None`` without a row."""
    return await pool.fetchval(INDEX_STATUS_SQL, storage_id)


async def top_entities_by_vector(pool: asyncpg.Pool, storage_id: str, vector: list[float], k: int) -> list[EntityHit]:
    """Return the ``k`` entities nearest to ``vector`` (cosine distance, ascending)."""
    rows = await pool.fetch(TOP_ENTITIES_SQL, storage_id, vector_literal(vector), max(0, k))
    return [EntityHit(r["id"], r["name"], r["type"], r["description"], float(r["rank"]), float(r["distance"])) for r in rows]


async def text_units_for_entities(
    pool: asyncpg.Pool, storage_id: str, entity_ids: list[str], limit: int
) -> list[TextUnitHit]:
    """Return the chunks mentioning ``entity_ids``, most matched entities first."""
    if not entity_ids or limit <= 0:
        return []
    rows = await pool.fetch(TEXT_UNITS_SQL, storage_id, entity_ids, limit)
    return [TextUnitHit(r["id"], r["pageRange"], r["content"], r["matched"]) for r in rows]
