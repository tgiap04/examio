"""Routing and fallback of ``GraphragRetriever`` (real Postgres; embedder, model and chunk search are fakes)."""

import asyncpg
import pytest
from chat_graph_seed import seed_graph
from graphrag_fakes import vector_for

from src.graphrag import graphrag_retrieval, reads, store
from src.graphrag.graphrag_retrieval import ChatRetrievalResult, GraphragRetriever
from src.graphrag.types import GraphData
from src.rag.vector_store_pg import DocumentChunk


class FakeSearcher:
    def __init__(self, chunks=None):
        self.chunks, self.calls = chunks or [], []

    async def search_similar(self, user_storage_ids, query, top_k=None, similarity_threshold=None, model_type=None):
        self.calls.append((user_storage_ids, query, top_k, model_type))
        return self.chunks


def make(pool, *, llm_reply="[]", dim=None, chunks=None):
    calls = {"embed": 0, "llm": 0}

    async def embed(text: str) -> list[float]:
        calls["embed"] += 1
        return vector_for("AES")[:dim]

    async def llm(prompt: str, max_tokens: int) -> str:
        calls["llm"] += 1
        return llm_reply

    searcher = FakeSearcher(chunks if chunks is not None else [DocumentChunk("fb1", "s1", "fallback text", "9", "Fallback title")])
    return GraphragRetriever(pool, embed, llm, searcher), searcher, calls


async def test_a_building_document_answers_from_vector_search_and_touches_no_graph_step(pool):
    await seed_graph(pool, "s1", status="BUILDING")
    retriever, searcher, calls = make(pool)
    result = await retriever.retrieve_for_chat("s1", "AES la gi", "model-x", top_k=5, max_content_length=500)
    assert isinstance(result, ChatRetrievalResult) and result.retrieval_mode == "vector_fallback"
    assert "[Trang 9]: fallback text" in result.combined_context and len(result.combined_context) <= 500
    assert result.sources == [{"content": "fallback text", "page": "9", "title": "Fallback title", "chunkId": "fb1"}]
    assert searcher.calls == [(["s1"], "AES la gi", 5, "model-x")]
    assert calls == {"embed": 0, "llm": 0}


async def test_no_index_row_a_failed_index_and_a_blank_question_all_fall_back(pool):
    retriever, searcher, _ = make(pool)
    assert (await retriever.retrieve_for_chat("unknown", "q", "m")).retrieval_mode == "vector_fallback"
    await seed_graph(pool, "s1", status="FAILED")
    assert (await retriever.retrieve_for_chat("s1", "AES", "m")).retrieval_mode == "vector_fallback"
    await seed_graph(pool, "s2")
    blank = await retriever.retrieve_for_chat("s2", "   ", "m")
    assert blank.retrieval_mode == "vector_fallback" and blank.combined_context is None and len(searcher.calls) == 2


async def test_a_ready_but_empty_graph_falls_back(pool):
    await store.upsert_pending(pool, "s1", "sig")
    await store.claim_next(pool)
    assert await store.replace_graph(pool, "s1", "sig", GraphData([], [], []), {})
    retriever, _, _ = make(pool)
    assert (await retriever.retrieve_for_chat("s1", "AES", "m")).retrieval_mode == "vector_fallback"


async def test_a_ready_document_uses_local_search_for_a_concept_question(pool):
    await seed_graph(pool, "s1")
    retriever, searcher, calls = make(pool)
    result = await retriever.retrieve_for_chat("s1", "AES hoat dong ra sao", "m")
    assert result.retrieval_mode == "local" and "## Thực thể và quan hệ" in result.combined_context
    assert result.sources and set(result.sources[0]) == {"content", "page", "title", "chunkId"}
    assert calls == {"embed": 1, "llm": 0} and searcher.calls == [] and result.metadata["elapsed_ms"] >= 0


async def test_an_overview_question_uses_global_search(pool):
    await seed_graph(pool, "s1")
    retriever, _, calls = make(pool, llm_reply='[{"point": "Ciphers and hashes", "score": 80, "report": 1}]')
    result = await retriever.retrieve_for_chat("s1", "Tài liệu này nói về gì?", "m")
    assert result.retrieval_mode == "global" and "Ciphers and hashes" in result.combined_context
    assert result.sources and calls["llm"] == 1 and calls["embed"] == 0


async def test_global_search_without_usable_answers_degrades_to_local(pool):
    await seed_graph(pool, "s1")
    retriever, _, calls = make(pool, llm_reply="not json")
    result = await retriever.retrieve_for_chat("s1", "Tóm tắt tài liệu", "m")
    assert result.retrieval_mode == "local" and calls["llm"] == 2 and calls["embed"] == 1


async def test_a_vector_size_mismatch_falls_back_with_a_warning(pool, caplog):
    await seed_graph(pool, "s1", dim_override=32)  # stored vectors are 32 wide, the query embedding is 64
    retriever, searcher, _ = make(pool)
    with caplog.at_level("WARNING"):
        result = await retriever.retrieve_for_chat("s1", "AES", "m")
    assert result.retrieval_mode == "vector_fallback" and len(searcher.calls) == 1
    assert any("differ from the query embedding" in r.message for r in caplog.records)


async def test_other_database_errors_are_not_swallowed(pool, monkeypatch):
    await seed_graph(pool, "s1")

    async def broken(*_a, **_k):
        raise asyncpg.PostgresError("connection lost")

    monkeypatch.setattr(reads, "top_entities_by_vector", broken)
    retriever, searcher, _ = make(pool)
    with pytest.raises(asyncpg.PostgresError):
        await retriever.retrieve_for_chat("s1", "AES", "m")
    assert searcher.calls == []


async def test_the_query_log_line_names_mode_and_counts(pool, caplog):
    await seed_graph(pool, "s1")
    retriever, _, _ = make(pool)
    with caplog.at_level("INFO"):
        await retriever.retrieve_for_chat("s1", "AES", "m")
    line = next(r.message for r in caplog.records if "[GRAPHRAG_QUERY] mode=" in r.message)
    assert "mode=local entities=4" in line and "units=3" in line and "elapsed_ms=" in line


async def test_the_module_entry_point_matches_the_defaults_of_the_previous_retriever():
    import inspect

    sig = inspect.signature(graphrag_retrieval.retrieve_for_chat)
    assert sig.parameters["top_k"].default == 8 and sig.parameters["max_content_length"].default == 8000
