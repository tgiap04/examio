"""Local search over a stored graph in a real Postgres (the embedder is fake)."""

from chat_graph_seed import seed_graph
from graphrag_fakes import vector_for

from src.graphrag.query.local_search import local_search


def embedder_of(text: str):
    async def embed(_query: str) -> list[float]:
        return vector_for(text)

    return embed


async def search(pool, sid: str, near: str, **kw):
    args = {"max_units": 8, "max_content_length": 8000} | kw
    return await local_search(pool, sid, "question", embedder_of(near), **args)


async def test_context_has_reports_graph_and_excerpts_with_pages(pool):
    await seed_graph(pool, "s1")
    outcome = await search(pool, "s1", "AES")
    context = outcome.context
    assert context.index("## Báo cáo chủ đề") < context.index("## Thực thể và quan hệ") < context.index("## Trích đoạn tài liệu")
    assert "Block ciphers: AES and DES" in context
    assert "- AES (concept): about AES" in context and "- AES -> RSA: AES relates RSA" in context
    assert "[Trang 1]: c1 talks about AES, DES" in context
    assert outcome.entities == 4 and outcome.reports >= 1 and outcome.units == 3


async def test_sources_keep_the_citation_shape_and_cap_at_three(pool):
    await seed_graph(pool, "s1")
    sources = (await search(pool, "s1", "AES")).sources
    assert 1 <= len(sources) <= 3
    assert set(sources[0]) == {"content", "page", "title", "chunkId"}
    assert sources[0]["chunkId"].startswith("s1c") and sources[0]["title"].startswith("Title ")


async def test_excerpts_rank_by_mentioned_entities_then_by_closeness_to_the_question(pool):
    await seed_graph(pool, "s1")  # c1 and c2 each mention two entities, c3 one
    assert [s["chunkId"] for s in (await search(pool, "s1", "s1c1", max_units=1)).sources] == ["s1c1"]
    assert [s["chunkId"] for s in (await search(pool, "s1", "s1c2", max_units=1)).sources] == ["s1c2"]
    assert (await search(pool, "s1", "s1c3", max_units=3)).sources[-1]["chunkId"] == "s1c3"


async def test_context_respects_the_character_budget(pool):
    await seed_graph(pool, "s1")
    outcome = await search(pool, "s1", "AES", max_content_length=300)
    assert len(outcome.context) <= 300 and "## Trích đoạn tài liệu" in outcome.context


async def test_a_document_without_entities_gives_none_and_never_reads_another_document(pool):
    await seed_graph(pool, "s1")
    assert await search(pool, "none", "AES") is None
    assert await search(pool, "s2", "AES") is None
