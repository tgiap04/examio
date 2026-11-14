"""Poller that builds GraphRAG indexes for ``ROLE=worker``.

It claims one ``GraphIndex`` row at a time (see :mod:`src.graphrag.store`), builds it
and records the result. On shutdown the build in flight is cancelled and its row goes
back to PENDING, so another worker (or the next start) picks it up without waiting for
the lease to expire.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random

import asyncpg

from . import indexer, store
from .embeddings import Embedder
from .types import GraphragSettings, LLMComplete

logger = logging.getLogger(__name__)

POLL_SECONDS = 5.0
POLL_JITTER = 0.2  # +-20 % so several workers do not poll in lockstep
LEASE_SLACK_MINUTES = 5  # the lease outlives the build timeout, so no second worker reclaims a live build


class IndexWorker:
    """Claim -> build -> record, until :meth:`stop`."""

    def __init__(
        self,
        pool: asyncpg.Pool,
        *,
        settings: GraphragSettings | None = None,
        llm: LLMComplete | None = None,
        embedder: Embedder | None = None,
        load_chunks: indexer.ChunkLoader = indexer.default_chunk_loader,
        poll_seconds: float = POLL_SECONDS,
    ) -> None:
        """``llm`` and ``embedder`` default to the configured models; tests pass fakes."""
        self._pool = pool
        self._settings = settings or GraphragSettings.from_env()
        self._llm = llm
        self._embedder = embedder
        self._load_chunks = load_chunks
        self._poll_seconds = poll_seconds
        self._stop = asyncio.Event()

    def stop(self) -> None:
        """Ask :meth:`run` to cancel the build in flight and return."""
        self._stop.set()

    async def run(self) -> None:
        """Poll until :meth:`stop`; a failing tick is logged, never fatal."""
        while not self._stop.is_set():
            worked = False
            try:
                worked = await self.tick()
            except Exception as exc:
                logger.error("[GRAPHRAG] worker tick failed: %s", exc)
            if not worked:
                delay = self._poll_seconds * random.uniform(1 - POLL_JITTER, 1 + POLL_JITTER)  # noqa: S311 - jitter, not security
                try:
                    await asyncio.wait_for(self._stop.wait(), delay)
                except TimeoutError:
                    pass

    async def tick(self) -> bool:
        """Claim and build at most one document; ``True`` when a row was claimed."""
        lease_minutes = math.ceil(self._settings.build_timeout_minutes) + LEASE_SLACK_MINUTES
        claim = await store.claim_next(self._pool, lease_minutes=lease_minutes)
        if claim is None:
            return False
        build = asyncio.create_task(self._execute(claim))
        stopped = asyncio.create_task(self._stop.wait())
        try:
            await asyncio.wait({build, stopped}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            stopped.cancel()
            if not build.done():
                build.cancel()  # shutdown (or our own cancellation): _execute releases the lease
            await asyncio.gather(build, return_exceptions=True)
        return True

    async def _execute(self, claim: store.Claim) -> None:
        storage_id = claim.storage_id
        try:
            llm = self._llm or indexer.default_llm(self._settings)
            embedder = self._embedder or indexer.default_embedder()
            async with asyncio.timeout(self._settings.build_timeout_minutes * 60):
                outcome = await indexer.build(
                    claim, pool=self._pool, llm=llm, embedder=embedder, settings=self._settings, load_chunks=self._load_chunks
                )
            logger.info(
                "[GRAPHRAG] user_storage_id=%s status=%s chunks=%d ok=%d failed=%d entities=%d relationships=%d communities=%d reports=%d attempt=%d",
                storage_id, outcome.status, outcome.chunks, outcome.ok, outcome.failed,
                outcome.entities, outcome.relationships, outcome.communities, outcome.reports, claim.attempts + 1,
            )
        except asyncio.CancelledError:
            await store.release_lease(self._pool, storage_id, claim.chunk_signature)
            logger.info("[GRAPHRAG] build cancelled, lease released user_storage_id=%s", storage_id)
            raise
        except Exception as exc:
            logger.error("[GRAPHRAG] build crashed user_storage_id=%s: %s", storage_id, exc, exc_info=True)
            await store.mark_failed(self._pool, storage_id, claim.chunk_signature, f"{type(exc).__name__}: {exc}")
