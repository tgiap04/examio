"""Plain vector search over the stored chunks, for documents without a usable graph yet."""

from __future__ import annotations

from typing import Any, Protocol

from .context_builder import (
    QueryOutcome,
    Section,
    SourceUnit,
    build_context,
    build_sources,
    format_unit,
)

SIMILARITY_THRESHOLD = 0.5  # what the previous retriever used for chat
SOURCE_LIMIT = 3


class ChunkSearcher(Protocol):
    """The slice of ``PgVectorStore`` this module uses."""

    async def search_similar(
        self,
        user_storage_ids: list[str],
        query: str,
        top_k: int | None = None,
        similarity_threshold: float | None = None,
        model_type: str | None = None,
    ) -> list[Any]:
        """Return the chunks of ``user_storage_ids`` nearest to ``query``."""
        ...


def default_searcher() -> ChunkSearcher:
    """Return the shared pgvector store."""
    from src.rag.vector_store_pg import get_pg_vector_store

    return get_pg_vector_store()


async def vector_fallback(
    searcher: ChunkSearcher,
    storage_id: str,
    query: str,
    model_type: str | None,
    *,
    top_k: int,
    max_content_length: int,
) -> QueryOutcome:
    """Top-``top_k`` chunks nearest to ``query`` as a context (empty context when nothing is close enough)."""
    if not query.strip():
        return QueryOutcome(None, [])
    chunks = await searcher.search_similar(
        [storage_id], query, top_k=top_k, similarity_threshold=SIMILARITY_THRESHOLD, model_type=model_type
    )
    units = [SourceUnit(c.id, c.page_range, c.title, c.content) for c in chunks]
    context = build_context([Section("Trích đoạn tài liệu", [format_unit(u) for u in units], 1.0)], max_content_length)
    return QueryOutcome(context, build_sources(units, SOURCE_LIMIT), units=len(units))
