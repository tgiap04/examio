"""A small stored graph for the chat search tests (import like ``graphrag_fakes``).

Entities AES(0) RSA(1) SHA(2) DES(3); chunks c1{AES,DES} c2{AES,RSA} c3{SHA}; relationships
AES-RSA (5), AES-SHA (9), SHA-DES (2); level-0 reports "Ciphers" {0,1,3} and "Hashing" {2}
(plus one failed report with no summary); level-1 reports "Block ciphers" {0,3} and "Public key" {1}.
"""

from graphrag_fakes import vector_for

from src.graphrag import store
from src.graphrag.types import (
    GraphCommunityRow,
    GraphData,
    GraphEntityRow,
    GraphRelationshipRow,
)

NAMES = ["AES", "RSA", "SHA", "DES"]
CHUNKS = {"c1": [0, 3], "c2": [0, 1], "c3": [2]}
INSERT_CHUNK = (
    'INSERT INTO "Document" (id, "userStorageId", "pageRange", title, content, embeddings)'
    " VALUES ($1, $2, $3, $4, $5, $6::extensions.vector)"
)


def eid(sid: str, i: int) -> str:
    return f"{sid}e{i}"


def community(sid: str, cid: str, level: int, key: int, members: list[int], title: str, summary: str) -> GraphCommunityRow:
    return GraphCommunityRow(f"{sid}{cid}", level, key, None, [eid(sid, i) for i in members], len(members), title, summary)


async def seed_graph(pool, sid: str, *, status: str = "READY", dim_override: int | None = None) -> None:
    """Store the graph of ``sid``; ``status`` other than READY leaves the queue row in that state."""
    for chunk_id, members in CHUNKS.items():
        vector = vector_for(f"{sid}{chunk_id}")[: dim_override or None]
        text = f"{chunk_id} talks about {', '.join(NAMES[i] for i in members)}"
        await pool.execute(INSERT_CHUNK, f"{sid}{chunk_id}", sid, chunk_id[-1], f"Title {chunk_id}", text, store.vector_literal(vector))
    entities = [
        GraphEntityRow(eid(sid, i), n, n.lower(), "concept", f"about {n}", 1, rank=1.0 - i / 10, embedding=vector_for(n)[: dim_override or None])
        for i, n in enumerate(NAMES)
    ]
    relationships = [
        GraphRelationshipRow(f"{sid}r{i}", eid(sid, a), eid(sid, b), f"{NAMES[a]} relates {NAMES[b]}", w)
        for i, (a, b, w) in enumerate([(0, 1, 5.0), (0, 2, 9.0), (2, 3, 2.0)])
    ]
    links = [(f"{sid}{c}", eid(sid, i)) for c, members in CHUNKS.items() for i in members]
    communities = [
        community(sid, "L0a", 0, 0, [0, 1, 3], "Ciphers", "Symmetric and asymmetric ciphers"),
        community(sid, "L0b", 0, 1, [2], "Hashing", "Hash functions"),
        community(sid, "L0c", 0, 2, [2, 3], "Failed", ""),
        community(sid, "L1a", 1, 0, [0, 3], "Block ciphers", "AES and DES"),
        community(sid, "L1b", 1, 1, [1], "Public key", "RSA"),
    ]
    await store.upsert_pending(pool, sid, "sig")
    await store.claim_next(pool)
    assert await store.replace_graph(pool, sid, "sig", GraphData(entities, relationships, links, communities), {})
    if status != "READY":
        await pool.execute('UPDATE "GraphIndex" SET "status" = $2 WHERE "userStorageId" = $1', sid, status)
