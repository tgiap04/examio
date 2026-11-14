"""Queue GraphRAG indexing for documents stored before GraphRAG existed.

``python -m src.graphrag.backfill [--dry-run] [--dim N]``: every ``userStorageId`` in
``Document`` without a ``GraphIndex`` row is queued as PENDING (the index worker builds
it). A document whose stored chunk vectors have another size than the current embedding
model cannot be searched together with new entity vectors, so it is skipped and
reported: it has to be uploaded again. ``--dry-run`` writes nothing.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass, field

import asyncpg

from . import indexer, store
from .embeddings import default_embedder

logger = logging.getLogger(__name__)

UNINDEXED_SQL = """
SELECT d."userStorageId" AS storage_id,
       coalesce(array_agg(DISTINCT extensions.vector_dims(d."embeddings"))
                FILTER (WHERE d."embeddings" IS NOT NULL), '{}') AS dims
FROM "Document" d
WHERE NOT EXISTS (SELECT 1 FROM "GraphIndex" g WHERE g."userStorageId" = d."userStorageId")
GROUP BY d."userStorageId"
ORDER BY d."userStorageId"
"""


@dataclass
class BackfillReport:
    """What a backfill run did (or, with ``dry_run``, would do)."""

    dry_run: bool
    queued: list[str] = field(default_factory=list)
    skipped_dimension: list[tuple[str, list[int]]] = field(default_factory=list)
    skipped_no_chunks: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


async def backfill(
    pool: asyncpg.Pool,
    *,
    current_dim: int,
    dry_run: bool = False,
    load_chunks: indexer.ChunkLoader = indexer.default_chunk_loader,
) -> BackfillReport:
    """Queue every document that has no ``GraphIndex`` row; see the module docstring."""
    report = BackfillReport(dry_run)
    for row in await pool.fetch(UNINDEXED_SQL):
        storage_id, dims = row["storage_id"], list(row["dims"])
        if any(dim != current_dim for dim in dims):
            report.skipped_dimension.append((storage_id, dims))
            continue
        try:
            chunks = await load_chunks(storage_id)
            if not chunks:
                report.skipped_no_chunks.append(storage_id)
                continue
            if not dry_run:
                await store.upsert_pending(pool, storage_id, indexer.chunk_signature((c.id, c.content) for c in chunks))
        except Exception as exc:
            logger.error("[GRAPHRAG_BACKFILL] %s failed: %s", storage_id, exc)
            report.errors.append(storage_id)
            continue
        report.queued.append(storage_id)
    return report


async def _probe_dimension() -> int:
    """Vector size of the current embedding model (one real embedding call)."""
    return len((await default_embedder()(["dimension probe"]))[0])


async def _run(dry_run: bool, dim: int | None) -> BackfillReport:
    from src import db

    try:
        current_dim = dim or await _probe_dimension()
        report = await backfill(await db.get_pool(), current_dim=current_dim, dry_run=dry_run)
    finally:
        await db.close_pools()
    verb = "would queue" if dry_run else "queued"
    logger.info(
        "[GRAPHRAG_BACKFILL] %s=%d skipped_dimension=%d skipped_no_chunks=%d errors=%d dim=%d",
        verb, len(report.queued), len(report.skipped_dimension), len(report.skipped_no_chunks), len(report.errors), current_dim,
    )
    for storage_id, dims in report.skipped_dimension:
        logger.warning("[GRAPHRAG_BACKFILL] skipped %s: stored dims %s != %d, upload it again", storage_id, dims, current_dim)
    return report


def main(argv: list[str] | None = None) -> int:
    """CLI entry point; exit code 1 when any document errored."""
    parser = argparse.ArgumentParser(prog="python -m src.graphrag.backfill", description=__doc__.split("\n\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    parser.add_argument("--dim", type=int, help="current embedding size (default: probe the embedding model once)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return 1 if asyncio.run(_run(args.dry_run, args.dim)).errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
