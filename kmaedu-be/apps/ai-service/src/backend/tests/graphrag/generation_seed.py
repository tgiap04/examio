"""Seed a small, fully READY GraphRAG graph (with communities) for the generation tests."""

from __future__ import annotations

from graphrag_fakes import vector_for

from src.graphrag import store
from src.graphrag.types import (
    GraphCommunityRow,
    GraphData,
    GraphEntityRow,
    GraphRelationshipRow,
)

INSERT_CHUNK = (
    'INSERT INTO "Document" (id, "userStorageId", "pageRange", content, embeddings)'
    " VALUES ($1, $2, $3, $4, $5::extensions.vector)"
)


async def add_chunk(pool, sid: str, chunk_id: str, page: str, content: str, vector: list[float] | None = None) -> None:
    """Insert one ``Document`` chunk; its embedding defaults to ``vector_for(chunk_id)``."""
    vec = vector if vector is not None else vector_for(chunk_id)
    await pool.execute(INSERT_CHUNK, chunk_id, sid, page, content, store.vector_literal(vec))


async def seed_graph(
    pool,
    sid: str,
    communities: list[tuple[str, list[str], float | None]],
    *,
    relationships: list[tuple[str, str, float]] = (),
    embed_entities: bool = True,
    extra_links: list[tuple[str, str]] = (),
) -> dict[str, str]:
    """Store a READY graph and return ``{entity name: entity id}``.

    ``communities`` is ``(title, entity names, rating)``; each entity has its own chunk
    ``<sid>c<n>`` on page ``n+1`` (``extra_links`` adds ``(chunk id, entity name)`` pairs).
    """
    names = [n for _, members, _ in communities for n in members]
    ids = {n: f"{sid}e{i}" for i, n in enumerate(names)}
    entities, links = [], []
    for i, name in enumerate(names):
        vec = vector_for(name) if embed_entities else None
        entities.append(GraphEntityRow(ids[name], name, name.lower(), "concept", f"about {name}", 1, rank=1 - i / 100, embedding=vec))
        chunk = f"{sid}c{i}"
        await add_chunk(pool, sid, chunk, str(i + 1), f"text about {name}")
        links.append((chunk, ids[name]))
    for chunk, name in extra_links:
        links.append((chunk, ids[name]))
    rels = [GraphRelationshipRow(f"{sid}r{i}", ids[a], ids[b], f"{a} relates to {b}", w) for i, (a, b, w) in enumerate(relationships)]
    rows = [
        GraphCommunityRow(f"{sid}k{i}", 0, i, None, [ids[n] for n in members], len(members), title=title, rating=rating)
        for i, (title, members, rating) in enumerate(communities)
    ]
    await store.upsert_pending(pool, sid, "sig")
    await store.claim_next(pool)
    assert await store.replace_graph(pool, sid, "sig", GraphData(entities, rels, links, rows), {})
    return ids
