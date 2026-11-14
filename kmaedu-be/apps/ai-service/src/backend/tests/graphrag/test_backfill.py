"""Backfill: queue documents without a GraphIndex row; skip other-dimension and empty ones; dry run writes nothing."""

from dataclasses import dataclass

from src.graphrag import backfill, indexer, store


@dataclass
class Chunk:
    id: str
    content: str
    page_range: str = "1"


async def document(pool, storage_id, *vectors):
    for i, vector in enumerate(vectors):
        await pool.execute(
            'INSERT INTO "Document" (id, "userStorageId", "pageRange", content, embeddings) VALUES ($1, $2, \'1\', $3, $4::vector)',
            f"{storage_id}_chunk_{i}", storage_id, f"text {i} of {storage_id}", vector,
        )


def chunks_of(*empty):
    """Loader: ``boom`` raises, ids in ``empty`` have no chunks, every other document has its first chunk."""

    async def load(storage_id):
        if storage_id == "boom":
            raise RuntimeError("ocr store down")
        return [] if storage_id in empty else [Chunk(f"{storage_id}_chunk_0", f"text 0 of {storage_id}")]

    return load


async def seed(pool):
    await document(pool, "old", "[1,2,3]", "[3,2,1]")  # current dimension, no index yet
    await document(pool, "done", "[1,2,3]")
    await store.upsert_pending(pool, "done", "existing-signature")  # already has a GraphIndex row
    await document(pool, "stale-dim", "[1,2,3,4]")  # embedded by an older model
    await document(pool, "mixed", "[1,2,3]", "[1,2,3,4]")
    await document(pool, "empty", "[1,2,3]")  # no chunks the loader can return


async def rows(pool):
    return {r["userStorageId"]: r["status"] for r in await pool.fetch('SELECT * FROM "GraphIndex"')}


async def test_backfill_queues_documents_without_an_index_and_reports_the_ones_it_skips(pool):
    await seed(pool)
    report = await backfill.backfill(pool, current_dim=3, load_chunks=chunks_of("empty"))
    assert report.queued == ["old"] and report.skipped_no_chunks == ["empty"] and report.errors == []
    assert sorted(report.skipped_dimension) == [("mixed", [3, 4]), ("stale-dim", [4])]
    assert await rows(pool) == {"done": "PENDING", "old": "PENDING"}
    signature = await pool.fetchval('SELECT "chunkSignature" FROM "GraphIndex" WHERE "userStorageId" = \'old\'')
    assert signature == indexer.chunk_signature([("old_chunk_0", "text 0 of old")])
    assert await pool.fetchval('SELECT "chunkSignature" FROM "GraphIndex" WHERE "userStorageId" = \'done\'') == "existing-signature"


async def test_dry_run_reports_the_same_but_writes_nothing(pool):
    await seed(pool)
    report = await backfill.backfill(pool, current_dim=3, dry_run=True, load_chunks=chunks_of("empty"))
    assert report.dry_run and report.queued == ["old"] and len(report.skipped_dimension) == 2
    assert await rows(pool) == {"done": "PENDING"}  # only the row the seed itself created


async def test_running_twice_queues_nothing_the_second_time(pool):
    await seed(pool)
    await backfill.backfill(pool, current_dim=3, load_chunks=chunks_of("empty"))
    again = await backfill.backfill(pool, current_dim=3, load_chunks=chunks_of("empty"))
    assert again.queued == [] and again.skipped_no_chunks == ["empty"]


async def test_one_document_failing_to_load_does_not_stop_the_others(pool):
    await document(pool, "boom", "[1,2,3]")
    await document(pool, "fine", "[1,2,3]")
    report = await backfill.backfill(pool, current_dim=3, load_chunks=chunks_of("boom"))
    assert report.errors == ["boom"] and report.queued == ["fine"]
    assert await rows(pool) == {"fine": "PENDING"}


async def test_a_new_model_dimension_moves_every_document_to_the_skipped_list(pool):
    await document(pool, "a", "[1,2,3]")
    report = await backfill.backfill(pool, current_dim=4, load_chunks=chunks_of())
    assert report.queued == [] and report.skipped_dimension == [("a", [3])]
