"""Plan quiz/flashcard "concept slots" from the GraphRAG index.

Each slot is one question or card aimed at a different entity or relationship, so two
model calls never both get the same ground to cover. Slots are shared out across the
level-0 communities (weight ``rating x log(1 + size)``), then packed into calls of at most
``max_batch`` slots with the text units that mention the target as evidence.
"""

from __future__ import annotations

import itertools
import logging
import math
from dataclasses import dataclass, replace

import asyncpg

from . import generation_reads as gr
from . import reads
from .embeddings import Embedder
from .generation_slots import (
    ANGLES,
    RELATIONSHIP_ANGLE,
    Slot,
    SlotBatch,
    allocate,
    pack,
)
from .types import TextUnitHit

logger = logging.getLogger(__name__)

MAX_SEEDS = 8  # narrow search: entities nearest to the keyword
NEIGHBOUR_LIMIT = 200  # narrow search: relationships read to find 1-hop neighbours
DEFAULT_RATING = 5.0  # a community whose report failed has no rating


@dataclass(frozen=True)
class _Group:
    id: str | None
    title: str
    weight: float
    entity_ids: list[str]


def _group_slots(
    group: _Group,
    quota: int,
    entities: dict[str, gr.EntityInfo],
    rels: list[gr.RelationshipInfo],
    priority: dict[str, int],
) -> list[tuple[Slot, list[str]]]:
    """Slots of one community with the entity ids whose text units are their evidence.

    Entities go by ``priority`` (narrow search: nearest to the keyword first), then by rank.
    """
    cid, title = group.id, group.title
    members = sorted(
        (entities[i] for i in group.entity_ids if i in entities),
        key=lambda e: (priority.get(e.id, len(priority)), -e.rank, e.name, e.id),
    )
    out = [(Slot(f"e:{e.id}:0", e.name, e.description, ANGLES[0], cid, title), [e.id]) for e in members[:quota]]
    inside = set(group.entity_ids)
    for rel in rels:
        if len(out) >= quota:
            break
        if rel.source_id in inside and rel.target_id in inside and rel.source_id in entities and rel.target_id in entities:
            src, dst = entities[rel.source_id], entities[rel.target_id]
            out.append((Slot(f"r:{rel.id}", f"{src.name} - {dst.name}", rel.description, RELATIONSHIP_ANGLE, cid, title), [src.id, dst.id]))
    reuse = 1
    while len(out) < quota and members:
        for e in members:
            if len(out) >= quota:
                break
            out.append((Slot(f"e:{e.id}:{reuse}", e.name, e.description, ANGLES[reuse % len(ANGLES)], cid, title), [e.id]))
        reuse += 1
    if reuse > 1:
        logger.info("[GRAPHRAG_GEN] community %r has %d entities for %d slots: reusing entities with new angles", title, len(members), quota)
    return out


async def _narrow_ids(pool: asyncpg.Pool, storage_id: str, keyword: str, embedder: Embedder | None) -> dict[str, int] | None:
    """Seed entities nearest to ``keyword`` plus their 1-hop neighbours as ``{id: position}``, or ``None`` for the whole document."""
    try:
        if embedder is None:
            raise ValueError("no embedder for the keyword")
        vector = (await embedder([keyword]))[0]
        seeds = await reads.top_entities_by_vector(pool, storage_id, vector, MAX_SEEDS)
    except Exception as exc:  # a failed keyword lookup must not fail the whole generation
        logger.warning("[GRAPHRAG_GEN] narrow keyword lookup failed (%s); using the whole document", exc)
        return None
    if not seeds:
        logger.info("[GRAPHRAG_GEN] narrow keyword %r: no entity matches; using the whole document", keyword)
        return None
    seed_ids = [h.id for h in seeds]
    allowed = {i: n for n, i in enumerate(seed_ids)}  # nearest first
    for rel in await gr.relationships_touching(pool, storage_id, seed_ids, NEIGHBOUR_LIMIT):
        for end in (rel.source_id, rel.target_id):
            allowed.setdefault(end, len(allowed))
    return allowed


def _groups(communities: list[gr.CommunityInfo], allowed: dict[str, int] | None) -> list[_Group]:
    groups = []
    covered: set[str] = set()
    for c in communities:
        ids = [i for i in c.entity_ids if allowed is None or i in allowed]
        covered.update(ids)
        if ids:
            weight = max(DEFAULT_RATING if c.rating is None else c.rating, 0.1) * math.log1p(len(ids))
            groups.append(_Group(c.id, c.title, weight, ids))
    leftover = sorted(set(allowed or ()) - covered)  # keyword hits that sit in no community
    if leftover:
        groups.append(_Group(None, "", math.log1p(len(leftover)), leftover))
    return sorted(groups, key=lambda g: -g.weight)  # stable: ties keep community order


def _evidence(drafts: list[tuple[Slot, list[str]]], units: dict[str, list[TextUnitHit]], per_slot: int) -> list[Slot]:
    slots = []
    for slot, ids in drafts:
        merged = [u for pair in itertools.zip_longest(*(units.get(i, []) for i in ids)) for u in pair if u is not None]
        unique = list({u.chunk_id: u for u in merged}.values())
        slots.append(replace(slot, evidence=tuple(unique[:per_slot])))
    return slots


async def plan_slots(
    pool: asyncpg.Pool,
    storage_id: str,
    total: int,
    *,
    keyword: str | None = None,
    narrow: bool = False,
    embedder: Embedder | None = None,
    max_batch: int = 12,
    evidence_per_slot: int = 3,
) -> list[SlotBatch]:
    """Plan exactly ``total`` slots, or ``[]`` when the document has no communities (caller falls back).

    ``narrow`` with a ``keyword`` limits the targets to the entities nearest to the keyword and
    their neighbours; when nothing matches, the whole document is used.
    """
    if total <= 0:
        return []
    communities = await gr.level0_communities(pool, storage_id)
    if not communities:
        return []
    allowed = await _narrow_ids(pool, storage_id, keyword, embedder) if narrow and keyword else None
    groups = _groups(communities, allowed)
    if not groups:
        return []
    ids = sorted({i for g in groups for i in g.entity_ids})
    entities = await gr.entities_by_ids(pool, storage_id, ids)
    rels = await gr.relationships_within(pool, storage_id, ids)
    quotas = allocate(total, [g.weight for g in groups])
    priority = allowed or {}
    drafts = [d for g, q in zip(groups, quotas, strict=True) if q for d in _group_slots(g, q, entities, rels, priority)]
    units = await gr.evidence_for_entities(pool, storage_id, sorted({i for _, eids in drafts for i in eids}), evidence_per_slot)
    batches = pack(_evidence(drafts, units, evidence_per_slot), max_batch)
    logger.info("[GRAPHRAG_GEN] planned slots=%d communities=%d batches=%d narrow=%s", len(drafts), len(groups), len(batches), allowed is not None)
    return batches
