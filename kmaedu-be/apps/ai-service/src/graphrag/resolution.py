"""Entity resolution: fold same-type entities whose embeddings are near-identical into one.

Exact ``(type, normName)`` duplicates are already one row (:mod:`assembly`). This step
catches the rest ("Ma hoa AES" vs "Mã hóa AES", "AES cipher" vs "AES") by cosine
similarity of the ``name: description`` embeddings. Only same-type entities merge, and
the threshold is configurable, because a wrong merge hides a concept for good.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from dataclasses import replace

import numpy as np

from .assembly import join_text, with_degrees
from .types import GraphData, GraphEntityRow, GraphRelationshipRow

logger = logging.getLogger(__name__)


def _components(entities: Sequence[GraphEntityRow], vectors: Mapping[str, Sequence[float]], threshold: float) -> list[list[int]]:
    """Index groups (size > 1) of same-type entities chained by cosine >= ``threshold``."""
    parent = list(range(len(entities)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    by_type: dict[str, list[int]] = {}
    for index, entity in enumerate(entities):
        if entity.id in vectors:
            by_type.setdefault(entity.type, []).append(index)
    for indexes in by_type.values():
        if len(indexes) < 2:
            continue
        matrix = np.array([vectors[entities[i].id] for i in indexes], dtype=float)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        matrix = matrix / np.where(norms == 0, 1.0, norms)
        for row, col in np.argwhere(np.triu(matrix @ matrix.T >= threshold, k=1)):
            parent[find(indexes[col])] = find(indexes[row])
    groups: dict[int, list[int]] = {}
    for index in range(len(entities)):
        groups.setdefault(find(index), []).append(index)
    return [g for g in groups.values() if len(g) > 1]


def merge_entities(
    graph: GraphData, vectors: Mapping[str, Sequence[float]], threshold: float
) -> tuple[GraphData, list[tuple[str, str]]]:
    """Merge near-duplicate entities; returns the new graph and the ``(merged away, survivor)`` name pairs.

    The survivor is the member with the highest degree (then most mentions, then first seen).
    Its description is the join of the members', so its embedding is cleared for a re-embed;
    relationships and chunk links are remapped, self-loops dropped, parallel edges summed.
    """
    entities = graph.entities
    groups = _components(entities, vectors, threshold)
    if not groups:
        return graph, []
    survivor_of: dict[str, str] = {}
    rows: dict[str, GraphEntityRow] = {}
    pairs: list[tuple[str, str]] = []
    for group in groups:
        keep_index = max(group, key=lambda i: (entities[i].degree, entities[i].description_count, -i))
        keep = entities[keep_index]
        rows[keep.id] = replace(
            keep,
            description=join_text([entities[i].description for i in group]),
            description_count=sum(entities[i].description_count for i in group),
            embedding=None,
        )
        for i in group:
            survivor_of[entities[i].id] = keep.id
            if i != keep_index:
                pairs.append((entities[i].name, keep.name))
    kept = [rows.get(e.id, e) for e in entities if survivor_of.get(e.id, e.id) == e.id]
    merged: dict[tuple[str, str], dict] = {}
    for rel in graph.relationships:
        source, target = survivor_of.get(rel.source_id, rel.source_id), survivor_of.get(rel.target_id, rel.target_id)
        if source == target:
            continue
        slot = merged.setdefault((source, target), {"id": rel.id, "descriptions": [], "weight": 0.0})
        slot["descriptions"].append(rel.description)
        slot["weight"] += rel.weight
    relationships = [GraphRelationshipRow(m["id"], s, t, join_text(m["descriptions"]), m["weight"]) for (s, t), m in merged.items()]
    links = sorted({(chunk, survivor_of.get(entity, entity)) for chunk, entity in graph.links})
    logger.info("[GRAPHRAG] resolution merged %d entities into %d", len(entities), len(kept))
    return GraphData(with_degrees(kept, relationships), relationships, links), pairs
