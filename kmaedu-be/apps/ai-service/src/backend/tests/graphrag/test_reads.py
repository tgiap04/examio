"""Shared GraphRAG read helpers against a real Postgres."""

from graphrag_fakes import vector_for

from src.graphrag import reads, store
from src.graphrag.types import GraphData, GraphEntityRow

INSERT_CHUNK = (
    'INSERT INTO "Document" (id, "userStorageId", "pageRange", content, embeddings)'
    " VALUES ($1, $2, $3, $4, $5::extensions.vector)"
)


def entity(sid: str, i: int, text: str) -> GraphEntityRow:
    return GraphEntityRow(f"{sid}e{i}", text, text.lower(), "concept", f"about {text}", 1, embedding=vector_for(text))


async def seed(pool, sid: str, names: list[str], links: list[tuple[str, int]]) -> None:
    for chunk_id in sorted({c for c, _ in links}):
        await pool.execute(INSERT_CHUNK, chunk_id, sid, chunk_id[-1], f"text of {chunk_id}", store.vector_literal(vector_for(chunk_id)))
    entities = [entity(sid, i, n) for i, n in enumerate(names)]
    await store.upsert_pending(pool, sid, "sig")
    await store.claim_next(pool)
    data = GraphData(entities, [], [(c, f"{sid}e{i}") for c, i in links])
    assert await store.replace_graph(pool, sid, "sig", data, {})


async def test_index_status_is_none_without_a_row_then_follows_the_queue(pool):
    assert await reads.index_status(pool, "s1") is None
    await store.upsert_pending(pool, "s1", "sig")
    assert await reads.index_status(pool, "s1") == "PENDING"
    await seed(pool, "s2", ["AES"], [("c2_1", 0)])
    assert await reads.index_status(pool, "s2") == "READY"


async def test_top_entities_rank_by_vector_distance_within_one_document(pool):
    await seed(pool, "s1", ["AES", "RSA", "SHA"], [("c1_1", 0)])
    await seed(pool, "s2", ["AES"], [("c2_1", 0)])
    hits = await reads.top_entities_by_vector(pool, "s1", vector_for("RSA"), k=2)
    assert [h.name for h in hits][0] == "RSA"
    assert len(hits) == 2 and all(h.id.startswith("s1") for h in hits)
    assert hits[0].distance <= hits[1].distance


async def test_top_entities_on_an_empty_graph_is_empty(pool):
    assert await reads.top_entities_by_vector(pool, "none", vector_for("x"), k=5) == []


async def test_text_units_order_by_how_many_requested_entities_they_mention(pool):
    await seed(pool, "s1", ["AES", "RSA", "SHA"], [("c1_1", 0), ("c1_2", 0), ("c1_2", 1), ("c1_3", 2)])
    units = await reads.text_units_for_entities(pool, "s1", ["s1e0", "s1e1"], limit=5)
    assert [u.chunk_id for u in units] == ["c1_2", "c1_1"]
    assert (units[0].matched, units[0].page_range, units[0].content) == (2, "2", "text of c1_2")


async def test_text_units_respect_limit_document_and_empty_input(pool):
    await seed(pool, "s1", ["AES"], [("c1_1", 0), ("c1_2", 0)])
    assert len(await reads.text_units_for_entities(pool, "s1", ["s1e0"], limit=1)) == 1
    assert await reads.text_units_for_entities(pool, "other", ["s1e0"], limit=5) == []
    assert await reads.text_units_for_entities(pool, "s1", [], limit=5) == []
