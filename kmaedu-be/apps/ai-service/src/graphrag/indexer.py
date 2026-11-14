"""Build the GraphRAG index of one document: ``build`` is the ordered step list.

load chunks -> extract -> threshold -> assemble -> embed -> resolve -> describe -> embed
-> communities -> reports -> replace_graph (READY). Each step takes and returns plain
data, and all LLM / embedding work goes through the injected ``llm`` and ``embedder``.
The steps run one after another, so ``settings.concurrency`` bounds the model calls
in flight for the whole build.
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections.abc import Awaitable, Callable, Iterable, Sequence
from dataclasses import dataclass, replace

import asyncpg

from . import store
from .assembly import assemble_graph
from .communities import detect
from .community_reports import write_reports
from .descriptions import summarize_descriptions
from .embeddings import Embedder, default_embedder, embed_entities
from .extraction import ChunkLike, extract_all
from .resolution import merge_entities
from .types import GraphData, GraphragSettings, LLMComplete

__all__ = ["BuildOutcome", "assemble_graph", "build", "chunk_signature", "default_chunk_loader", "default_embedder", "default_llm"]

logger = logging.getLogger(__name__)

READY_THRESHOLD = 0.7  # share of chunks that must extract cleanly
MAX_MERGED_PAIRS_IN_STATS = 100
STALE_RETRY_SECONDS = 60  # pause before re-claiming a row whose chunks changed under the build

ChunkLoader = Callable[[str], Awaitable[Sequence[ChunkLike]]]


@dataclass(frozen=True)
class BuildOutcome:
    """Result of one build. ``status``: READY, FAILED, or STALE (input changed or gone; nothing written)."""

    status: str
    chunks: int = 0
    ok: int = 0
    failed: int = 0
    entities: int = 0
    relationships: int = 0
    error: str | None = None
    communities: int = 0
    reports: int = 0


def chunk_signature(chunks: Iterable[tuple[str, str]]) -> str:
    """Stable fingerprint of a document's ``(chunk id, content)`` pairs."""
    digest = hashlib.sha256()
    for chunk_id, content in sorted(chunks):
        digest.update(chunk_id.encode())
        digest.update(b"\0")
        digest.update(content.encode())
        digest.update(b"\0")
    return digest.hexdigest()


def default_llm(settings: GraphragSettings) -> LLMComplete:
    """LLM callable over ``model_manager`` (no-reasoning model, bounded tokens, strict on truncation)."""
    from src.llm.model_manager import model_manager

    async def complete(prompt: str, max_tokens: int) -> str:
        return await model_manager.generate_content_with_model(
            prompt, settings.llm_model, max_tokens=max_tokens, raise_on_truncation=True
        )

    return complete


async def default_chunk_loader(storage_id: str) -> Sequence[ChunkLike]:
    """Chunks as stored by the OCR step."""
    from src.backend.services.ocr_service import ocr_service

    return await ocr_service.get_document_chunks(storage_id)


def _done(timings: dict[str, int], storage_id: str, stage: str, started: float, **info: int) -> None:
    """Record and log (``[GRAPHRAG_TIMING]``) one finished step."""
    timings[stage] = int((time.perf_counter() - started) * 1000)
    detail = " ".join(f"{k}={v}" for k, v in info.items())
    logger.info("[GRAPHRAG_TIMING] stage=%s user_storage_id=%s %s elapsed_ms=%d", stage, storage_id, detail, timings[stage])


async def _enrich(
    graph: GraphData,
    chunks: Sequence[ChunkLike],
    *,
    storage_id: str,
    llm: LLMComplete,
    embedder: Embedder,
    settings: GraphragSettings,
    timings: dict[str, int],
    stats: dict,
) -> GraphData:
    """Resolve, describe, embed, cluster and report on the assembled graph."""
    workers, tokens = settings.concurrency, settings.max_tokens
    started = time.perf_counter()
    entities = await embed_entities(graph.entities, embedder, workers)
    _done(timings, storage_id, "embed_for_resolution", started, entities=len(entities))

    started = time.perf_counter()
    graph, pairs = merge_entities(replace(graph, entities=entities), {e.id: e.embedding for e in entities}, settings.merge_threshold)
    stats["merged_pairs"] = [list(p) for p in pairs[:MAX_MERGED_PAIRS_IN_STATS]]
    stats["merged_count"] = len(pairs)
    _done(timings, storage_id, "resolve", started, merged=len(pairs), entities=len(graph.entities))

    started = time.perf_counter()
    rows, summarised, failed = await summarize_descriptions(graph.entities, llm, workers, tokens)
    _done(timings, storage_id, "describe", started, summarised=summarised, failed=failed)

    started = time.perf_counter()
    graph = replace(graph, entities=await embed_entities(rows, embedder, workers))
    _done(timings, storage_id, "embed", started, entities=len(graph.entities))

    started = time.perf_counter()
    graph = replace(graph, communities=detect(graph))
    _done(timings, storage_id, "communities", started, communities=len(graph.communities))

    started = time.perf_counter()
    texts = {c.id: c.content for c in chunks}
    communities, reported, unreported = await write_reports(graph, texts, llm, embedder, workers, tokens)
    _done(timings, storage_id, "reports", started, reported=reported, unreported=unreported)
    stats.update(communities=len(communities), reports=reported, reports_failed=unreported, descriptions_summarised=summarised)
    return replace(graph, communities=communities)


async def build(
    claim: store.Claim,
    *,
    pool: asyncpg.Pool,
    llm: LLMComplete,
    embedder: Embedder,
    settings: GraphragSettings,
    load_chunks: ChunkLoader = default_chunk_loader,
) -> BuildOutcome:
    """Index the claimed document and record the outcome in ``GraphIndex``.

    ``mark_failed`` / ``replace_graph`` are guarded by the claimed signature, so a
    document re-uploaded or deleted mid-build is never overwritten with this result.
    An embedding failure raises (the worker records FAILED with backoff); a failed
    community report only leaves that community without report text.
    """
    storage_id = claim.storage_id
    chunks = await load_chunks(storage_id)
    if not chunks:
        await store.mark_failed(pool, storage_id, claim.chunk_signature, "no chunks stored for the document")
        return BuildOutcome("FAILED", error="no chunks")
    if chunk_signature((c.id, c.content) for c in chunks) != claim.chunk_signature:
        # Chunks changed since queued: back to the queue, with a pause so a persistent mismatch cannot poll hot.
        await store.release_lease(pool, storage_id, claim.chunk_signature, retry_after_seconds=STALE_RETRY_SECONDS)
        return BuildOutcome("STALE", chunks=len(chunks))

    timings: dict[str, int] = {}
    started = time.perf_counter()
    extractions, failed = await extract_all(chunks, llm, settings.concurrency, settings.max_tokens)
    _done(timings, storage_id, "extract", started, chunks=len(chunks), ok=len(extractions), failed=failed)
    if len(extractions) / len(chunks) < READY_THRESHOLD:
        error = f"extraction succeeded for {len(extractions)}/{len(chunks)} chunks (need {READY_THRESHOLD:.0%})"
        await store.mark_failed(pool, storage_id, claim.chunk_signature, error)
        return BuildOutcome("FAILED", len(chunks), len(extractions), failed, error=error)

    graph = assemble_graph(extractions)
    stats: dict = {"chunks": len(chunks), "extracted": len(extractions), "failed": failed, "entities_raw": len(graph.entities)}
    graph = await _enrich(
        graph, chunks, storage_id=storage_id, llm=llm, embedder=embedder, settings=settings, timings=timings, stats=stats
    )
    stats.update(entities=len(graph.entities), relationships=len(graph.relationships), timings_ms=timings)
    started = time.perf_counter()
    written = await store.replace_graph(pool, storage_id, claim.chunk_signature, graph, stats)
    _done(timings, storage_id, "write", started, written=int(written))
    if not written:
        return BuildOutcome("STALE", len(chunks), len(extractions), failed)
    return BuildOutcome(
        "READY", len(chunks), len(extractions), failed, len(graph.entities), len(graph.relationships),
        communities=len(graph.communities), reports=stats["reports"],
    )
