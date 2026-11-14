"""Turn per-chunk extractions into graph rows (exact ``(type, normName)`` merge) and derive degrees."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import replace

from .types import (
    ChunkExtraction,
    GraphData,
    GraphEntityRow,
    GraphRelationshipRow,
    normalize_name,
)

MAX_DESCRIPTION_CHARS = 2000


def join_text(parts: Sequence[str], limit: int = MAX_DESCRIPTION_CHARS) -> str:
    """Distinct non-empty parts joined with `` | ``, capped."""
    return " | ".join(dict.fromkeys(p for p in parts if p))[:limit]


def with_degrees(entities: Sequence[GraphEntityRow], relationships: Sequence[GraphRelationshipRow]) -> list[GraphEntityRow]:
    """Set ``degree`` (distinct relationships touching the entity) and ``rank`` (degree / max degree)."""
    degree: dict[str, int] = {}
    for rel in relationships:
        degree[rel.source_id] = degree.get(rel.source_id, 0) + 1
        degree[rel.target_id] = degree.get(rel.target_id, 0) + 1
    top = max(degree.values(), default=0)
    return [replace(e, degree=degree.get(e.id, 0), rank=degree.get(e.id, 0) / top if top else 0.0) for e in entities]


def assemble_graph(extractions: Sequence[ChunkExtraction]) -> GraphData:
    """Merge per-chunk extractions into rows: exact ``(type, normName)`` match only.

    Fuzzy merging is :mod:`resolution`. Relationship weight is the sum of the strengths seen.
    """
    entities: dict[tuple[str, str], dict] = {}
    pairs: dict[tuple[str, str], dict] = {}
    links: set[tuple[str, str]] = set()
    for extraction in extractions:
        ids: dict[str, str] = {}
        for entity in extraction.entities:
            norm = normalize_name(entity.name)
            slot = entities.setdefault(
                (entity.type, norm),
                {"id": uuid.uuid4().hex, "name": entity.name, "norm": norm, "type": entity.type, "descriptions": [], "mentions": 0},
            )
            slot["descriptions"].append(entity.description)
            slot["mentions"] += 1
            ids[norm] = slot["id"]
            links.add((extraction.chunk_id, slot["id"]))
        for rel in extraction.relationships:
            source, target = ids.get(normalize_name(rel.source)), ids.get(normalize_name(rel.target))
            if source is None or target is None or source == target:
                continue
            pair = pairs.setdefault((source, target), {"descriptions": [], "weight": 0.0})
            pair["descriptions"].append(rel.description)
            pair["weight"] += rel.strength
    rel_rows = [
        GraphRelationshipRow(uuid.uuid4().hex, s, t, join_text(p["descriptions"]), p["weight"]) for (s, t), p in pairs.items()
    ]
    entity_rows = [
        GraphEntityRow(
            id=e["id"], name=e["name"], norm_name=e["norm"], type=e["type"],
            description=join_text(e["descriptions"]), description_count=e["mentions"],
        )
        for e in entities.values()
    ]
    return GraphData(with_degrees(entity_rows, rel_rows), rel_rows, sorted(links))
