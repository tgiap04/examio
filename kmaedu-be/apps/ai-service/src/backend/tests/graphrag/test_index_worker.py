"""IndexWorker: tick bookkeeping, crash handling and clean shutdown."""

import asyncio
import json
from dataclasses import dataclass

from graphrag_fakes import (
    embedder_fixture,  # noqa: F401  (provides the fake_embedder fixture)
)

from src.graphrag import indexer, store
from src.graphrag.index_worker import IndexWorker
from src.graphrag.types import GraphragSettings

SETTINGS = GraphragSettings(concurrency=2, max_tokens=128)


@dataclass
class Chunk:
    id: str
    content: str
    page_range: str = "1"


CHUNKS = [Chunk("c0", "text zero"), Chunk("c1", "text one")]
REPLY = json.dumps({"entities": [{"name": "Alpha", "type": "concept"}, {"name": "Beta", "type": "concept"}], "relationships": []})


async def load(storage_id):
    return CHUNKS


async def good_llm(prompt, max_tokens):
    return REPLY


async def queue(pool, sid="s1"):
    await store.upsert_pending(pool, sid, indexer.chunk_signature((c.id, c.content) for c in CHUNKS))


def worker(pool, llm, embedder, **kw):
    return IndexWorker(pool, settings=SETTINGS, llm=llm, embedder=embedder, load_chunks=load, poll_seconds=0.05, **kw)


async def test_tick_with_an_empty_queue_does_nothing(pool, fake_embedder):
    assert await worker(pool, good_llm, fake_embedder).tick() is False


async def test_tick_builds_one_document_to_ready(pool, fake_embedder):
    await queue(pool)
    assert await worker(pool, good_llm, fake_embedder).tick() is True
    assert await pool.fetchval('SELECT status FROM "GraphIndex"') == "READY"
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 2  # exact-merged across both chunks


async def test_tick_with_an_llm_that_always_fails_marks_failed_with_attempt_one(pool, fake_embedder):
    async def down(prompt, max_tokens):
        raise ConnectionError("router 429")

    await queue(pool)
    await worker(pool, down, fake_embedder).tick()
    row = await pool.fetchrow('SELECT * FROM "GraphIndex"')
    assert (row["status"], row["attempts"]) == ("FAILED", 1) and row["nextAttemptAt"] is not None


async def test_a_build_that_crashes_is_recorded_as_failed_not_lost(pool, fake_embedder):
    async def broken_load(storage_id):
        raise RuntimeError("db hiccup")

    await queue(pool)
    await IndexWorker(pool, settings=SETTINGS, llm=good_llm, embedder=fake_embedder, load_chunks=broken_load).tick()
    row = await pool.fetchrow('SELECT * FROM "GraphIndex"')
    assert (row["status"], row["attempts"]) == ("FAILED", 1) and "db hiccup" in row["error"]


async def test_run_picks_up_work_and_stop_ends_the_loop(pool, fake_embedder):
    w = worker(pool, good_llm, fake_embedder)
    task = asyncio.create_task(w.run())
    await queue(pool)
    for _ in range(100):
        if await pool.fetchval('SELECT status FROM "GraphIndex"') == "READY":
            break
        await asyncio.sleep(0.05)
    w.stop()
    await asyncio.wait_for(task, 5)
    assert await pool.fetchval('SELECT status FROM "GraphIndex"') == "READY"


async def test_stopping_mid_build_cancels_it_and_releases_the_lease_to_pending(pool, fake_embedder):
    started = asyncio.Event()

    async def hang(prompt, max_tokens):
        started.set()
        await asyncio.sleep(3600)

    await queue(pool)
    w = worker(pool, hang, fake_embedder)
    task = asyncio.create_task(w.run())
    await asyncio.wait_for(started.wait(), 5)
    assert await pool.fetchval('SELECT status FROM "GraphIndex"') == "BUILDING"
    w.stop()
    await asyncio.wait_for(task, 5)  # returns promptly instead of waiting for the model
    row = await pool.fetchrow('SELECT * FROM "GraphIndex"')
    assert (row["status"], row["leaseUntil"], row["attempts"]) == ("PENDING", None, 0)
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 0


async def test_cancelling_the_run_task_also_releases_the_lease(pool, fake_embedder):
    started = asyncio.Event()

    async def hang(prompt, max_tokens):
        started.set()
        await asyncio.sleep(3600)

    await queue(pool)
    task = asyncio.create_task(worker(pool, hang, fake_embedder).run())
    await asyncio.wait_for(started.wait(), 5)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert await pool.fetchval('SELECT status FROM "GraphIndex"') == "PENDING"


async def test_two_workers_never_build_the_same_document_twice(pool, fake_embedder):
    calls = []

    async def counting(prompt, max_tokens):
        if "You extract a knowledge graph" in prompt:  # count extraction calls only; later steps call the model too
            calls.append(prompt)
        await asyncio.sleep(0.05)
        return REPLY

    await queue(pool)
    results = await asyncio.gather(worker(pool, counting, fake_embedder).tick(), worker(pool, counting, fake_embedder).tick())
    assert sorted(results) == [False, True]
    assert len(calls) == len(CHUNKS)  # one build = one LLM call per chunk


async def test_the_lease_covers_the_configured_build_timeout(pool, fake_embedder):
    seen = {}

    async def load_and_peek(storage_id):
        seen["lease_minutes"] = await pool.fetchval(
            """SELECT EXTRACT(EPOCH FROM ("leaseUntil" - (now() AT TIME ZONE 'UTC'))) / 60 FROM "GraphIndex" """
        )
        return CHUNKS

    await queue(pool)
    settings = GraphragSettings(concurrency=2, max_tokens=128, build_timeout_minutes=30)
    w = IndexWorker(pool, settings=settings, llm=good_llm, embedder=fake_embedder, load_chunks=load_and_peek, poll_seconds=0.05)
    assert await w.tick() is True
    assert 34 < seen["lease_minutes"] <= 35  # timeout + 5 minutes of slack


async def test_a_build_slower_than_the_configured_timeout_is_marked_failed(pool, fake_embedder):
    async def slow_load(storage_id):
        await asyncio.sleep(2)
        return CHUNKS

    await queue(pool)
    settings = GraphragSettings(concurrency=2, max_tokens=128, build_timeout_minutes=0.01)  # 0.6 s
    w = IndexWorker(pool, settings=settings, llm=good_llm, embedder=fake_embedder, load_chunks=slow_load, poll_seconds=0.05)
    assert await w.tick() is True
    row = await pool.fetchrow('SELECT status, attempts, error FROM "GraphIndex"')
    assert (row["status"], row["attempts"]) == ("FAILED", 1) and "TimeoutError" in row["error"]
