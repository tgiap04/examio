"""Read queries that only the quiz/flashcard slot planner needs.

Shared lookups (index status, entities by vector, text units by entity) live in
:mod:`src.graphrag.reads`. Every query is scoped to one ``userStorageId`` and takes
all its ids in one round trip, so the planner never issues a query per slot.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import asyncpg

from .types import TextUnitHit

logger = logging.getLogger(__name__)

COMMUNITIES_SQL = """
SELECT id, "entityIds", size, title, rating FROM "GraphCommunity"
WHERE "userStorageId" = $1 AND level = 0 ORDER BY "communityKey", id
"""
ENTITIES_SQL = """
SELECT id, name, type, description, rank FROM "GraphEntity"
WHERE "userStorageId" = $1 AND id = ANY($2::text[])
"""
REL_COLUMNS = 'SELECT id, "sourceId", "targetId", description, weight FROM "GraphRelationship"'
RELS_WITHIN_SQL = f"""{REL_COLUMNS}
WHERE "userStorageId" = $1 AND "sourceId" = ANY($2::text[]) AND "targetId" = ANY($2::text[])
ORDER BY weight DESC, id
"""
RELS_TOUCHING_SQL = f"""{REL_COLUMNS}
WHERE "userStorageId" = $1 AND ("sourceId" = ANY($2::text[]) OR "targetId" = ANY($2::text[]))
ORDER BY weight DESC, id LIMIT $3
"""
# Chunks that mention an entity, nearest (cosine) to the entity's own embedding first.
EVIDENCE_BY_COSINE_SQL = """
SELECT eid, id, "pageRange", content FROM (
    SELECT l."entityId" AS eid, d.id, d."pageRange", d.content,
           row_number() OVER (PARTITION BY l."entityId"
                              ORDER BY d.embeddings <=> e.embedding NULLS LAST, d."createdAt", d.id) AS rn
    FROM "GraphTextUnitEntity" l
    JOIN "GraphEntity" e ON e.id = l."entityId" AND e."userStorageId" = l."userStorageId"
    JOIN "Document" d ON d.id = l."chunkId" AND d."userStorageId" = l."userStorageId"
    WHERE l."userStorageId" = $1 AND l."entityId" = ANY($2::text[])
) t WHERE rn <= $3 ORDER BY eid, rn
"""
# Same without the vector operator: used when chunk and entity embeddings differ in size.
EVIDENCE_BY_ORDER_SQL = """
SELECT eid, id, "pageRange", content FROM (
    SELECT l."entityId" AS eid, d.id, d."pageRange", d.content,
           row_number() OVER (PARTITION BY l."entityId" ORDER BY d."createdAt", d.id) AS rn
    FROM "GraphTextUnitEntity" l
    JOIN "Document" d ON d.id = l."chunkId" AND d."userStorageId" = l."userStorageId"
    WHERE l."userStorageId" = $1 AND l."entityId" = ANY($2::text[])
) t WHERE rn <= $3 ORDER BY eid, rn
"""


@dataclass(frozen=True)
class CommunityInfo:
    """A level-0 community with the fields the slot allocation weighs."""

    id: str
    entity_ids: list[str]
    size: int
    title: str
    rating: float | None


@dataclass(frozen=True)
class EntityInfo:
    """An entity as the planner needs it (no embedding)."""

    id: str
    name: str
    type: str
    description: str
    rank: float


@dataclass(frozen=True)
class RelationshipInfo:
    """A stored relationship between two entity ids."""

    id: str
    source_id: str
    target_id: str
    description: str
    weight: float


def _ids(value: object) -> list[str]:
    parsed = json.loads(value) if isinstance(value, str) else value
    return [str(i) for i in parsed] if isinstance(parsed, list) else []


async def level0_communities(pool: asyncpg.Pool, storage_id: str) -> list[CommunityInfo]:
    """Return the level-0 communities in stable (key) order; empty when the document has none."""
    rows = await pool.fetch(COMMUNITIES_SQL, storage_id)
    return [
        CommunityInfo(r["id"], _ids(r["entityIds"]), int(r["size"]), r["title"] or "",
                      None if r["rating"] is None else float(r["rating"]))
        for r in rows
    ]


async def entities_by_ids(pool: asyncpg.Pool, storage_id: str, ids: list[str]) -> dict[str, EntityInfo]:
    """Return ``{id: EntityInfo}`` for the requested ids (missing ids are simply absent)."""
    if not ids:
        return {}
    rows = await pool.fetch(ENTITIES_SQL, storage_id, ids)
    return {r["id"]: EntityInfo(r["id"], r["name"], r["type"], r["description"], float(r["rank"])) for r in rows}


async def relationships_within(pool: asyncpg.Pool, storage_id: str, ids: list[str]) -> list[RelationshipInfo]:
    """Return relationships whose both ends are in ``ids``, strongest first."""
    if not ids:
        return []
    return _relationships(await pool.fetch(RELS_WITHIN_SQL, storage_id, ids))


async def relationships_touching(
    pool: asyncpg.Pool, storage_id: str, ids: list[str], limit: int
) -> list[RelationshipInfo]:
    """Return up to ``limit`` relationships with at least one end in ``ids``, strongest first."""
    if not ids or limit <= 0:
        return []
    return _relationships(await pool.fetch(RELS_TOUCHING_SQL, storage_id, ids, limit))


def _relationships(rows: list[asyncpg.Record]) -> list[RelationshipInfo]:
    return [RelationshipInfo(r["id"], r["sourceId"], r["targetId"], r["description"], float(r["weight"])) for r in rows]


async def evidence_for_entities(
    pool: asyncpg.Pool, storage_id: str, entity_ids: list[str], per_entity: int
) -> dict[str, list[TextUnitHit]]:
    """Return up to ``per_entity`` text units per entity, ranked by cosine to the entity embedding.

    If the chunk and entity vectors cannot be compared (pgvector rejects mixed sizes) the
    units come back in document order instead; an entity without links maps to nothing.
    """
    if not entity_ids or per_entity <= 0:
        return {}
    try:
        rows = await pool.fetch(EVIDENCE_BY_COSINE_SQL, storage_id, entity_ids, per_entity)
    except asyncpg.PostgresError as exc:
        logger.warning("[GRAPHRAG_GEN] evidence by cosine unavailable (%s); using document order", exc)
        rows = await pool.fetch(EVIDENCE_BY_ORDER_SQL, storage_id, entity_ids, per_entity)
    units: dict[str, list[TextUnitHit]] = {}
    for r in rows:
        units.setdefault(r["eid"], []).append(TextUnitHit(r["id"], r["pageRange"], r["content"], 1))
    return units
