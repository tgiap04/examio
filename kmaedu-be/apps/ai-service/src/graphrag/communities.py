"""Two-level Louvain communities over the entity graph.

Edges are the relationships (weighted) plus weak co-occurrence edges between entities
that share a chunk, so a sparse graph still has structure. Level 0 uses a coarse
resolution (fewer, larger communities), level 1 a finer one; a level-1 community's
parent is the level-0 community it overlaps most. Communities of fewer than two
entities are not stored (their entities stay in the graph). Seeded, so the same graph
always yields the same partition.
"""

from __future__ import annotations

import itertools
import uuid
from collections.abc import Sequence

import networkx as nx

from .types import GraphCommunityRow, GraphData

LEVEL_RESOLUTIONS = (0.7, 1.3)
SEED = 42
CO_OCCURRENCE_WEIGHT = 0.5
MIN_SIZE = 2


def _graph(data: GraphData) -> nx.Graph:
    graph = nx.Graph()
    graph.add_nodes_from(e.id for e in data.entities)  # entity order fixes Louvain's node order
    for rel in data.relationships:
        if graph.has_edge(rel.source_id, rel.target_id):
            graph[rel.source_id][rel.target_id]["weight"] += rel.weight
        else:
            graph.add_edge(rel.source_id, rel.target_id, weight=rel.weight)
    by_chunk: dict[str, list[str]] = {}
    for chunk_id, entity_id in data.links:
        if entity_id in graph:
            by_chunk.setdefault(chunk_id, []).append(entity_id)
    for members in by_chunk.values():
        for a, b in itertools.combinations(sorted(set(members)), 2):
            if not graph.has_edge(a, b):
                graph.add_edge(a, b, weight=CO_OCCURRENCE_WEIGHT)
    return graph


def _partition(graph: nx.Graph, order: dict[str, int], resolution: float, seed: int) -> list[list[str]]:
    parts = nx.community.louvain_communities(graph, weight="weight", resolution=resolution, seed=seed)
    groups = [sorted(part, key=order.__getitem__) for part in parts if len(part) >= MIN_SIZE]
    return sorted(groups, key=lambda g: (-len(g), order[g[0]]))


def detect(data: GraphData, resolutions: Sequence[float] = LEVEL_RESOLUTIONS, seed: int = SEED) -> list[GraphCommunityRow]:
    """Communities of every level (``resolutions[i]`` is level ``i``), parents linked to the previous level."""
    if len(data.entities) < MIN_SIZE:
        return []
    graph = _graph(data)
    order = {e.id: i for i, e in enumerate(data.entities)}
    communities: list[GraphCommunityRow] = []
    previous: list[GraphCommunityRow] = []
    for level, resolution in enumerate(resolutions):
        current: list[GraphCommunityRow] = []
        for key, members in enumerate(_partition(graph, order, resolution, seed)):
            parent = _parent(members, previous)
            current.append(GraphCommunityRow(uuid.uuid4().hex, level, key, parent, members, len(members)))
        communities += current
        previous = current
    return communities


def _parent(members: list[str], candidates: list[GraphCommunityRow]) -> str | None:
    """Id of the candidate sharing the most members (lowest key on a tie), ``None`` without overlap."""
    mine = set(members)
    best, best_overlap = None, 0
    for candidate in candidates:
        overlap = len(mine.intersection(candidate.entity_ids))
        if overlap > best_overlap:
            best, best_overlap = candidate.id, overlap
    return best
