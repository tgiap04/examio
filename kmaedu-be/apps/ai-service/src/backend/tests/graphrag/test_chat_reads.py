"""Chat-only SQL reads against a real Postgres."""

from chat_graph_seed import eid, seed_graph
from graphrag_fakes import vector_for

from src.graphrag.query import chat_reads


async def test_relationships_put_those_among_the_entities_first_then_one_step_out(pool):
    await seed_graph(pool, "s1")
    await seed_graph(pool, "s2")
    hits = await chat_reads.relationships_around(pool, "s1", [eid("s1", 0), eid("s1", 1)], limit=10)
    assert [(h.source, h.target) for h in hits] == [("AES", "RSA"), ("AES", "SHA")]
    assert [(h.source, h.target) for h in await chat_reads.relationships_around(pool, "s1", [eid("s1", 0), eid("s1", 1)], limit=1)] == [
        ("AES", "RSA")
    ]
    assert await chat_reads.relationships_around(pool, "s1", [], limit=5) == []


async def test_relationships_never_cross_documents(pool):
    await seed_graph(pool, "s1")
    await seed_graph(pool, "s2")
    assert await chat_reads.relationships_around(pool, "s2", [eid("s1", 0)], limit=10) == []


async def test_reports_for_entities_filter_level_summary_and_order_by_overlap(pool):
    await seed_graph(pool, "s1")
    hits = await chat_reads.reports_for_entities(pool, "s1", [eid("s1", 0), eid("s1", 3), eid("s1", 1)], level=1, limit=5)
    assert [h.title for h in hits] == ["Block ciphers", "Public key"]
    assert hits[0].entity_ids == [eid("s1", 0), eid("s1", 3)]
    assert [h.title for h in await chat_reads.reports_for_entities(pool, "s1", [eid("s1", 3)], level=0, limit=5)] == ["Ciphers"]  # not the failed one
    assert len(await chat_reads.reports_for_entities(pool, "s1", [eid("s1", 0), eid("s1", 1)], level=1, limit=1)) == 1


async def test_reports_at_level_skip_failed_reports_and_other_documents(pool):
    await seed_graph(pool, "s1")
    await seed_graph(pool, "s2")
    hits = await chat_reads.reports_at_level(pool, "s1", level=0, limit=10)
    assert sorted(h.title for h in hits) == ["Ciphers", "Hashing"]
    assert all(e.startswith("s1") for h in hits for e in h.entity_ids)
    assert await chat_reads.reports_at_level(pool, "none", level=0, limit=10) == []


async def test_units_rank_by_mentions_then_cosine_and_carry_title_and_page(pool):
    await seed_graph(pool, "s1")
    ids = [eid("s1", 0), eid("s1", 1)]  # c2 mentions both, c1 only AES
    units = await chat_reads.units_for_entities(pool, "s1", ids, vector_for("s1c1"), limit=5)
    assert [u.chunk_id for u in units] == ["s1c2", "s1c1"]
    assert (units[0].page_range, units[0].title, units[0].content) == ("2", "Title c2", "c2 talks about AES, RSA")
    ids = [eid("s1", 0)]  # c1 and c2 tie on one mention: the cosine decides
    assert (await chat_reads.units_for_entities(pool, "s1", ids, vector_for("s1c1"), limit=5))[0].chunk_id == "s1c1"
    assert (await chat_reads.units_for_entities(pool, "s1", ids, vector_for("s1c2"), limit=5))[0].chunk_id == "s1c2"


async def test_units_work_without_a_query_vector_and_respect_limit_and_document(pool):
    await seed_graph(pool, "s1")
    ids = [eid("s1", 0)]
    assert len(await chat_reads.units_for_entities(pool, "s1", ids, None, limit=5)) == 2
    assert len(await chat_reads.units_for_entities(pool, "s1", ids, None, limit=1)) == 1
    assert await chat_reads.units_for_entities(pool, "other", ids, None, limit=5) == []
    assert await chat_reads.units_for_entities(pool, "s1", [], None, limit=5) == []
