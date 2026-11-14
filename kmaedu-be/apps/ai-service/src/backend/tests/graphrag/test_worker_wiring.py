"""ROLE=worker starts the GraphRAG index worker next to the consumer and relay, and stops it cleanly."""

import asyncio
import json

from graphrag_fakes import (
    embedder_fixture,  # noqa: F401  (provides the fake_embedder fixture)
)

from src.backend.messaging.worker import run_worker
from src.graphrag import indexer, store

REPLY = json.dumps({"entities": [{"name": "Alpha", "type": "concept"}, {"name": "Beta", "type": "concept"}], "relationships": []})


async def test_run_worker_builds_a_queued_index_and_shuts_down(pool, rabbitmq_url, database_url, tmp_path, monkeypatch, fake_embedder):
    monkeypatch.setenv("RABBITMQ_URL", rabbitmq_url)
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("WORKER_HEARTBEAT_FILE", str(tmp_path / "hb"))

    async def llm(prompt, max_tokens):
        return REPLY

    monkeypatch.setattr(indexer, "default_llm", lambda settings: llm)
    monkeypatch.setattr(indexer, "default_embedder", lambda: fake_embedder)
    await pool.execute(
        'INSERT INTO "Document" (id, "userStorageId", "pageRange", content, embeddings)'
        " VALUES ('w1_chunk_0', 'w1', '1', 'some text', '[1,2,3]'::vector)"
    )
    await store.upsert_pending(pool, "w1", indexer.chunk_signature([("w1_chunk_0", "some text")]))

    stop = asyncio.Event()
    task = asyncio.create_task(run_worker(stop))
    try:
        for _ in range(200):
            if await pool.fetchval('SELECT status FROM "GraphIndex" WHERE "userStorageId" = \'w1\'') == "READY":
                break
            await asyncio.sleep(0.1)
        assert await pool.fetchval('SELECT count(*) FROM "GraphEntity" WHERE "userStorageId" = \'w1\'') == 2
    finally:
        stop.set()
        await asyncio.wait_for(task, 20)
