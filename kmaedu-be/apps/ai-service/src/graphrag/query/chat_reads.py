"""SQL reads that only chat search needs (shared reads live in ``graphrag.reads``).

Every query is filtered by ``userStorageId``; ids that arrive from the caller are only
ever used together with it, so nothing crosses documents.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import asyncpg

from ..store import vector_literal
from .context_builder import SourceUnit

RELATIONSHIPS_SQL = """
SELECT s.name AS source, t.name AS target, r.description, r.weight
FROM "GraphRelationship" r
JOIN "GraphEntity" s ON s.id = r."sourceId" AND s."userStorageId" = r."userStorageId"
JOIN "GraphEntity" t ON t.id = r."targetId" AND t."userStorageId" = r."userStorageId"
WHERE r."userStorageId" = $1 AND (r."sourceId" = ANY($2::text[]) OR r."targetId" = ANY($2::text[]))
ORDER BY (r."sourceId" = ANY($2::text[]) AND r."targetId" = ANY($2::text[])) DESC, r.weight DESC, r.id
LIMIT $3
"""

REPORTS_FOR_ENTITIES_SQL = """
SELECT c.id, c.title, c.summary, c."entityIds",
       (SELECT count(*) FROM jsonb_array_elements_text(c."entityIds") e WHERE e = ANY($3::text[])) AS overlap
FROM "GraphCommunity" c
WHERE c."userStorageId" = $1 AND c.level = $2 AND c.summary <> '' AND c."entityIds" ?| $3::text[]
ORDER BY overlap DESC, c.rating DESC NULLS LAST, c.id
LIMIT $4
"""

REPORTS_AT_LEVEL_SQL = """
SELECT id, title, summary, "entityIds"
FROM "GraphCommunity"
WHERE "userStorageId" = $1 AND level = $2 AND summary <> ''
ORDER BY rating DESC NULLS LAST, id
LIMIT $3
"""

# Chunks that mention the entities, most-mentioning first, then nearest to the question.
# A NULL query vector or a chunk without an embedding sorts last, never errors.
UNITS_SQL = """
WITH m AS (
    SELECT "chunkId", count(*)::int AS matched
    FROM "GraphTextUnitEntity"
    WHERE "userStorageId" = $1 AND "entityId" = ANY($2::text[])
    GROUP BY "chunkId"
)
SELECT d.id, d."pageRange", d.title, d.content
FROM m
JOIN "Document" d ON d.id = m."chunkId" AND d."userStorageId" = $1
ORDER BY m.matched DESC, d.embeddings <=> $3::extensions.vector NULLS LAST, d."createdAt", d.id
LIMIT $4
"""


@dataclass(frozen=True)
class RelationshipHit:
    """A relationship with both entity names resolved."""

    source: str
    target: str
    description: str
    weight: float


@dataclass(frozen=True)
class ReportHit:
    """A community report (never one with an empty summary: that is a failed report)."""

    id: str
    title: str
    summary: str
    entity_ids: list[str]


def _entity_ids(raw: str | list[str]) -> list[str]:
    return [str(x) for x in (json.loads(raw) if isinstance(raw, str) else raw)]


async def relationships_around(pool: asyncpg.Pool, storage_id: str, entity_ids: list[str], limit: int) -> list[RelationshipHit]:
    """Relationships touching ``entity_ids``: those among them first, then one step out, heaviest first."""
    if not entity_ids or limit <= 0:
        return []
    rows = await pool.fetch(RELATIONSHIPS_SQL, storage_id, entity_ids, limit)
    return [RelationshipHit(r["source"], r["target"], r["description"], float(r["weight"])) for r in rows]


async def reports_for_entities(
    pool: asyncpg.Pool, storage_id: str, entity_ids: list[str], level: int, limit: int
) -> list[ReportHit]:
    """Return the ``level`` reports whose community holds any of ``entity_ids``, most overlapping first."""
    if not entity_ids or limit <= 0:
        return []
    rows = await pool.fetch(REPORTS_FOR_ENTITIES_SQL, storage_id, level, entity_ids, limit)
    return [ReportHit(r["id"], r["title"], r["summary"], _entity_ids(r["entityIds"])) for r in rows]


async def reports_at_level(pool: asyncpg.Pool, storage_id: str, level: int, limit: int) -> list[ReportHit]:
    """Up to ``limit`` reports of ``level``, highest rated first."""
    if limit <= 0:
        return []
    rows = await pool.fetch(REPORTS_AT_LEVEL_SQL, storage_id, level, limit)
    return [ReportHit(r["id"], r["title"], r["summary"], _entity_ids(r["entityIds"])) for r in rows]


async def units_for_entities(
    pool: asyncpg.Pool, storage_id: str, entity_ids: list[str], query_vector: list[float] | None, limit: int
) -> list[SourceUnit]:
    """Chunks mentioning ``entity_ids``; ties on the mention count break by cosine distance to ``query_vector``."""
    if not entity_ids or limit <= 0:
        return []
    rows = await pool.fetch(UNITS_SQL, storage_id, entity_ids, vector_literal(query_vector), limit)
    return [SourceUnit(r["id"], r["pageRange"], r["title"], r["content"]) for r in rows]
