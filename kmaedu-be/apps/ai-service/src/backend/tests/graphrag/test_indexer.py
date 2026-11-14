"""indexer.build: threshold, backoff bookkeeping, stale-signature guard, and graph assembly."""

import json
from dataclasses import dataclass

from graphrag_fakes import (
    embedder_fixture,  # noqa: F401  (provides the fake_embedder fixture)
)

from src.graphrag import indexer, store
from src.graphrag.types import (
    ChunkExtraction,
    ExtractedEntity,
    ExtractedRelationship,
    GraphragSettings,
)

SETTINGS = GraphragSettings(concurrency=3, max_tokens=256)


@dataclass
class Chunk:
    id: str
    content: str
    page_range: str = "1"


def answer(*names: str, rel: bool = True) -> str:
    entities = [{"name": n, "type": "concept", "description": f"about {n}"} for n in names]
    rels = [{"source": names[0], "target": names[1], "description": "relates", "strength": 6}] if rel and len(names) > 1 else []
    return json.dumps({"entities": entities, "relationships": rels})


def loader(chunks):
    async def load(storage_id):
        return chunks

    return load


def llm_for(table: dict[str, str]):
    """Answer by looking for the chunk text in the prompt; a missing key raises like a down model."""

    async def complete(prompt: str, max_tokens: int) -> str:
        for text, reply in table.items():
            if text in prompt:
                return reply
        raise ConnectionError("model down")

    return complete


async def queue(pool, chunks, sid="s1"):
    sig = indexer.chunk_signature((c.id, c.content) for c in chunks)
    await store.upsert_pending(pool, sid, sig)
    return await store.claim_next(pool)


async def test_a_clean_build_writes_the_graph_and_marks_ready(pool, fake_embedder):
    chunks = [Chunk("c0", "text zero"), Chunk("c1", "text one")]
    claim = await queue(pool, chunks)
    llm = llm_for({"text zero": answer("Alpha", "Beta"), "text one": answer("Beta", "Gamma")})
    out = await indexer.build(claim, pool=pool, llm=llm, embedder=fake_embedder, settings=SETTINGS, load_chunks=loader(chunks))
    assert (out.status, out.ok, out.failed, out.entities, out.relationships) == ("READY", 2, 0, 3, 2)
    row = await pool.fetchrow('SELECT * FROM "GraphIndex"')
    assert row["status"] == "READY" and json.loads(row["stats"])["entities"] == 3
    beta = await pool.fetchrow('SELECT * FROM "GraphEntity" WHERE "normName" = \'beta\'')
    assert (beta["descriptionCount"], beta["degree"]) == (2, 2)  # merged across both chunks
    assert await pool.fetchval('SELECT count(*) FROM "GraphTextUnitEntity"') == 4


async def test_seventy_percent_of_chunks_is_enough_for_ready(pool, fake_embedder):
    chunks = [Chunk(f"c{i}", f"text {i}") for i in range(10)]
    claim = await queue(pool, chunks)
    table = {f"text {i}": answer(f"Name {i}", f"Other {i}") for i in range(7)}  # 3 chunks fail
    out = await indexer.build(claim, pool=pool, llm=llm_for(table), embedder=fake_embedder, settings=SETTINGS, load_chunks=loader(chunks))
    assert (out.status, out.ok, out.failed) == ("READY", 7, 3)
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 14


async def test_forty_percent_failures_fail_the_index_with_backoff_and_write_nothing(pool, fake_embedder):
    chunks = [Chunk(f"c{i}", f"text {i}") for i in range(10)]
    claim = await queue(pool, chunks)
    table = {f"text {i}": answer(f"Name {i}", f"Other {i}") for i in range(6)}  # 4 chunks fail
    out = await indexer.build(claim, pool=pool, llm=llm_for(table), embedder=fake_embedder, settings=SETTINGS, load_chunks=loader(chunks))
    assert (out.status, out.ok, out.failed) == ("FAILED", 6, 4)
    row = await pool.fetchrow('SELECT * FROM "GraphIndex"')
    assert (row["status"], row["attempts"]) == ("FAILED", 1) and row["nextAttemptAt"] is not None
    assert "6/10" in row["error"]
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 0


async def test_unparseable_and_truncated_answers_count_as_failed_chunks(pool, fake_embedder):
    chunks = [Chunk("c0", "good"), Chunk("c1", "cut"), Chunk("c2", "junk")]
    claim = await queue(pool, chunks)
    llm = llm_for({"good": answer("Alpha", "Beta"), "cut": '{"entities": [{"name": "Al', "junk": "sorry I cannot"})
    out = await indexer.build(claim, pool=pool, llm=llm, embedder=fake_embedder, settings=SETTINGS, load_chunks=loader(chunks))
    assert (out.status, out.ok, out.failed) == ("FAILED", 1, 2)


async def test_a_document_without_chunks_fails(pool, fake_embedder):
    claim = await queue(pool, [Chunk("c0", "x")])
    out = await indexer.build(claim, pool=pool, llm=llm_for({}), embedder=fake_embedder, settings=SETTINGS, load_chunks=loader([]))
    assert out.status == "FAILED"
    assert (await pool.fetchval('SELECT status FROM "GraphIndex"')) == "FAILED"


async def test_chunks_changed_since_queueing_are_discarded_and_requeued(pool, fake_embedder):
    old = [Chunk("c0", "old text")]
    claim = await queue(pool, old)
    new = [Chunk("c0", "new text")]
    out = await indexer.build(claim, pool=pool, llm=llm_for({"new text": answer("A1", "B1")}), embedder=fake_embedder, settings=SETTINGS, load_chunks=loader(new))
    assert out.status == "STALE"
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 0
    assert await pool.fetchval('SELECT status FROM "GraphIndex"') == "PENDING"


async def test_reupload_during_extraction_discards_the_result(pool, fake_embedder):
    chunks = [Chunk("c0", "text zero")]
    claim = await queue(pool, chunks)

    async def llm(prompt, max_tokens):
        await store.upsert_pending(pool, "s1", "signature-of-the-new-upload")  # user re-uploads mid-build
        return answer("Alpha", "Beta")

    out = await indexer.build(claim, pool=pool, llm=llm, embedder=fake_embedder, settings=SETTINGS, load_chunks=loader(chunks))
    assert out.status == "STALE"
    row = await pool.fetchrow('SELECT * FROM "GraphIndex"')
    assert (row["status"], row["chunkSignature"]) == ("PENDING", "signature-of-the-new-upload")
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 0


def test_chunk_signature_changes_with_content_and_ids_but_not_with_order():
    base = indexer.chunk_signature([("a", "1"), ("b", "2")])
    assert base == indexer.chunk_signature([("b", "2"), ("a", "1")])
    assert base != indexer.chunk_signature([("a", "1"), ("b", "3")])
    assert base != indexer.chunk_signature([("a", "1"), ("c", "2")])


def test_assemble_merges_exact_matches_sums_weights_and_skips_cross_chunk_names():
    one = ChunkExtraction(
        "c0",
        [ExtractedEntity("Entropy", "concept", "d1"), ExtractedEntity("Heat", "concept", "h")],
        [ExtractedRelationship("Entropy", "Heat", "r1", 4)],
    )
    two = ChunkExtraction(
        "c1",
        [ExtractedEntity("entropy", "concept", "d2"), ExtractedEntity("Entropy", "formula", "f")],
        [ExtractedRelationship("entropy", "Heat", "r2", 5)],  # Heat is not in this chunk
    )
    graph = indexer.assemble_graph([one, two])
    by = {(e.norm_name, e.type): e for e in graph.entities}
    assert set(by) == {("entropy", "concept"), ("heat", "concept"), ("entropy", "formula")}
    merged = by[("entropy", "concept")]
    assert merged.description_count == 2 and merged.description == "d1 | d2" and merged.degree == 1
    assert [(r.weight, r.description) for r in graph.relationships] == [(4.0, "r1")]
    assert len(graph.links) == 4
