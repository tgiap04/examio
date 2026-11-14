"""Chat retrieval over the GraphRAG index: route, search, or fall back to plain vector search.

``retrieve_for_chat`` keeps the result shape ``chat_service`` read from the previous
retriever (``combined_context``, ``sources``, ``retrieval_mode``, ``metadata``).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import asyncpg

from . import reads
from .query.context_builder import QueryOutcome
from .query.global_search import global_search
from .query.local_search import QueryEmbedder, local_search
from .query.router import classify
from .query.vector_fallback import ChunkSearcher, default_searcher, vector_fallback
from .types import GraphragSettings, LLMComplete

logger = logging.getLogger(__name__)

DEFAULT_CHAT_TOP_K = 8
DEFAULT_CHAT_MAX_CONTENT_LENGTH = 8000
_DIMENSION_ERRORS = ("different vector dimensions", "dimensions, not")  # pgvector: query vs stored vectors


@dataclass
class ChatRetrievalResult:
    """What chat answers from: the context text, the citations and how they were found."""

    combined_context: str | None
    sources: list[dict[str, Any]]
    retrieval_mode: str  # local | global | vector_fallback
    metadata: dict[str, Any] = field(default_factory=dict)


def default_query_embedder() -> QueryEmbedder:
    """Gemini embedding of the question (``retrieval_query``), created on first use."""
    client = None

    async def embed(text: str) -> list[float]:
        nonlocal client
        if client is None:
            from src.llm.gemini_embeddings import GeminiEmbeddings

            client = GeminiEmbeddings()
        return await client.create_embedding(text, "retrieval_query")

    return embed


def _is_dimension_mismatch(exc: BaseException) -> bool:
    return isinstance(exc, asyncpg.PostgresError) and any(m in str(exc) for m in _DIMENSION_ERRORS)


class GraphragRetriever:
    """Chat retrieval with injectable pool, embedder, model and chunk searcher (defaults are the real ones)."""

    def __init__(
        self,
        pool: asyncpg.Pool | None = None,
        embedder: QueryEmbedder | None = None,
        llm: LLMComplete | None = None,
        searcher: ChunkSearcher | None = None,
        settings: GraphragSettings | None = None,
    ) -> None:
        """Use real collaborators for every argument left ``None``."""
        self._pool, self._embedder, self._llm, self._searcher = pool, embedder, llm, searcher
        self._settings = settings or GraphragSettings.from_env()

    async def retrieve_for_chat(
        self,
        user_storage_id: str,
        query: str,
        model_type: str,
        top_k: int = DEFAULT_CHAT_TOP_K,
        max_content_length: int = DEFAULT_CHAT_MAX_CONTENT_LENGTH,
    ) -> ChatRetrievalResult:
        """Context and citations for ``query`` on one document (never reads another ``userStorageId``)."""
        started = time.perf_counter()
        pool = self._pool
        if pool is None:
            from src.db import get_pool

            pool = await get_pool()
        outcome, mode, reason = None, "vector_fallback", "not_ready"
        if not query.strip():
            reason = "blank_query"
        elif await reads.index_status(pool, user_storage_id) == "READY":
            outcome, mode, reason = await self._graph_search(pool, user_storage_id, query, top_k, max_content_length)
        if outcome is None:
            fallback = await vector_fallback(
                self._searcher or default_searcher(), user_storage_id, query, model_type,
                top_k=top_k, max_content_length=max_content_length,
            )
            outcome, mode = fallback, "vector_fallback"
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "[GRAPHRAG_QUERY] mode=%s entities=%d reports=%d units=%d elapsed_ms=%d user_storage_id=%s%s",
            mode, outcome.entities, outcome.reports, outcome.units, elapsed_ms, user_storage_id,
            f" reason={reason}" if mode == "vector_fallback" else "",
        )
        return ChatRetrievalResult(
            outcome.context, outcome.sources, mode, {**outcome.metadata, "elapsed_ms": elapsed_ms, "units": outcome.units}
        )

    async def _graph_search(
        self, pool: asyncpg.Pool, storage_id: str, query: str, top_k: int, budget: int
    ) -> tuple[QueryOutcome | None, str, str]:
        """``(outcome, mode, fallback reason)``; ``outcome`` is ``None`` when the caller must fall back."""
        embedder = self._embedder or default_query_embedder()
        try:
            if classify(query) == "global":
                llm = self._llm or _default_llm(self._settings)
                outcome = await global_search(
                    pool, storage_id, query, llm,
                    max_tokens=self._settings.max_tokens, concurrency=self._settings.concurrency, max_content_length=budget,
                )
                if outcome is not None:
                    return outcome, "global", ""
            outcome = await local_search(pool, storage_id, query, embedder, max_units=top_k, max_content_length=budget)
        except asyncpg.PostgresError as exc:
            if not _is_dimension_mismatch(exc):
                raise
            logger.warning("[GRAPHRAG_QUERY] stored vectors differ from the query embedding size; using vector search: %s", exc)
            return None, "vector_fallback", "dimension_mismatch"
        return outcome, "local", "empty_graph"


def _default_llm(settings: GraphragSettings) -> LLMComplete:
    from .indexer import default_llm

    return default_llm(settings)


_default = GraphragRetriever()


async def retrieve_for_chat(
    user_storage_id: str,
    query: str,
    model_type: str,
    top_k: int = DEFAULT_CHAT_TOP_K,
    max_content_length: int = DEFAULT_CHAT_MAX_CONTENT_LENGTH,
) -> ChatRetrievalResult:
    """Retrieve with the real pool, embedder and model (the entry point ``chat_service`` calls)."""
    return await _default.retrieve_for_chat(user_storage_id, query, model_type, top_k, max_content_length)
