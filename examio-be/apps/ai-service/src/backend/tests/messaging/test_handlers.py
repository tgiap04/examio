"""Event handlers: outcomes reach the outbox with the payloads part D / document consume."""

import json
import os

import httpx
import pytest
from helpers import FakePublisher, message_for

from src.backend.messaging import document_handlers as dh
from src.backend.messaging import generation_handler as gh
from src.backend.messaging.consumer import EventConsumer
from src.backend.messaging.topology import MAX_RETRIES

UPLOADED = {
    "storageId": "st1",
    "userId": "u1",
    "filename": "a.pdf",
    "mimetype": "application/pdf",
    "downloadUrl": "https://files.example/a.pdf?sig=1",
}


async def outbox_events(pool) -> list[dict]:
    rows = await pool.fetch("SELECT envelope FROM outbox_events ORDER BY seq")
    return [json.loads(r["envelope"]) for r in rows]


def consumer_for(pool, key, handler):
    return EventConsumer(pool, {key: handler}, FakePublisher())


async def test_uploaded_success_publishes_processed_with_the_page_count(pool, monkeypatch):
    async def fake_process(storage_id, filename, mimetype, url):
        assert (storage_id, filename, mimetype, url) == ("st1", "a.pdf", "application/pdf", UPLOADED["downloadUrl"])
        return 7

    monkeypatch.setattr(dh, "_process", fake_process)
    message = message_for("document.uploaded", UPLOADED)
    await consumer_for(pool, "document.uploaded", dh.on_document_uploaded).handle_message(message)

    (event,) = await outbox_events(pool)
    assert message.acked
    assert event["type"] == "ai.document.processed" and event["source"] == "ai"
    assert event["data"] == {"storageId": "st1", "pageCount": 7}


async def test_uploaded_unextractable_file_publishes_failed_immediately(pool, monkeypatch):
    from src.backend.services.ocr_service import NoContentExtractedError

    async def fake_process(*args):
        raise NoContentExtractedError("empty")

    monkeypatch.setattr(dh, "_process", fake_process)
    message = message_for("document.uploaded", UPLOADED)
    await consumer_for(pool, "document.uploaded", dh.on_document_uploaded).handle_message(message)
    (event,) = await outbox_events(pool)
    assert message.acked and event["type"] == "ai.document.failed"
    assert event["data"] == {"storageId": "st1", "reason": "NO_CONTENT"}


async def test_uploaded_expired_presigned_url_is_a_download_failure_not_a_retry(pool, monkeypatch):
    async def fake_process(*args):
        response = httpx.Response(403, request=httpx.Request("GET", "https://x"))
        raise httpx.HTTPStatusError("forbidden", request=response.request, response=response)

    monkeypatch.setattr(dh, "_process", fake_process)
    await consumer_for(pool, "document.uploaded", dh.on_document_uploaded).handle_message(
        message_for("document.uploaded", UPLOADED)
    )
    assert (await outbox_events(pool))[0]["data"]["reason"] == "DOWNLOAD_FAILED"


async def test_uploaded_transient_error_retries_then_fails_on_the_last_attempt(pool, monkeypatch):
    async def fake_process(*args):
        raise ConnectionError("embedding api down")

    monkeypatch.setattr(dh, "_process", fake_process)
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"document.uploaded": dh.on_document_uploaded}, publisher)

    early = message_for("document.uploaded", UPLOADED, headers={"x-retry-count": 1})
    await consumer.handle_message(early)
    assert early.acked and len(publisher.published) == 1 and await outbox_events(pool) == []

    last = message_for("document.uploaded", UPLOADED, headers={"x-retry-count": MAX_RETRIES})
    await consumer.handle_message(last)
    assert last.acked and len(publisher.published) == 1  # no further retry
    (event,) = await outbox_events(pool)
    assert event["type"] == "ai.document.failed" and event["data"]["reason"] == "PROCESSING_ERROR"


async def test_uploaded_with_a_bad_payload_is_dead_lettered(pool):
    message = message_for("document.uploaded", {"storageId": "st1"})
    await consumer_for(pool, "document.uploaded", dh.on_document_uploaded).handle_message(message)
    assert message.nacked and message.requeued is False


async def seed_document(pool, storage_id: str) -> None:
    await pool.execute(
        'INSERT INTO "Document" (id, "userStorageId", "pageRange", content, embeddings)'
        " VALUES ($1, $2, '1', 'text', '[1,2,3]'::vector)",
        f"{storage_id}_chunk_0",
        storage_id,
    )
    await pool.execute('INSERT INTO "DocumentEntity" (id, "userStorageId", name, type) VALUES ($1, $2, \'n\', \'t\')', f"e_{storage_id}", storage_id)
    await pool.execute(
        'INSERT INTO "UserStorageGraph" (id, "userStorageId", "chunkSignature") VALUES ($1, $2, \'sig\')',
        f"g_{storage_id}",
        storage_id,
    )
    await pool.execute(
        'INSERT INTO "UserStorageGraphGroup" (id, "graphId", "userStorageId", "groupIndex", "pageRanges", "chunkIds")'
        " VALUES ($1, $2, $3, 0, '[]', '[]')",
        f"gg_{storage_id}",
        f"g_{storage_id}",
        storage_id,
    )


async def test_deleted_drops_vectors_entities_and_graph_for_the_given_ids_only(pool):
    await seed_document(pool, "st1")
    await seed_document(pool, "st2")
    await seed_document(pool, "keep")
    message = message_for("document.deleted", {"storageIds": ["st1", "st2", "ghost"], "userId": "u"})
    await consumer_for(pool, "document.deleted", dh.on_document_deleted).handle_message(message)

    assert message.acked
    for table in ('"Document"', '"DocumentEntity"', '"UserStorageGraph"', '"UserStorageGraphGroup"'):
        assert await pool.fetchval(f'SELECT array_agg("userStorageId") FROM {table}') == ["keep"], table


async def test_deleted_is_idempotent(pool):
    await seed_document(pool, "st1")
    consumer = consumer_for(pool, "document.deleted", dh.on_document_deleted)
    first = message_for("document.deleted", {"storageIds": ["st1"], "userId": "u"})
    await consumer.handle_message(first)
    await consumer.handle_message(type(first)(first.routing_key, first.body, {}, first.message_id))
    assert await pool.fetchval('SELECT count(*) FROM "Document"') == 0


REQUEST = {
    "jobId": "job1",
    "userId": "u1",
    "storageId": "st1",
    "type": "quiz",
    "options": {"numItems": 2, "isNarrowSearch": False},
    "model": "",
}
QUIZ = {"question": "q", "options": ["a", "b", "c", "d"], "answer": "a", "sourcePageRange": "1"}


def generation(monkeypatch, result=None, error=None):
    async def fake(kind, storage_id, count, narrow, keyword, model):
        if error:
            raise error
        assert (kind, storage_id, count, narrow, keyword, model) == (REQUEST["type"], "st1", 2, False, None, None)
        return result

    monkeypatch.setattr(gh, "_generate", fake)


async def test_generation_completed_carries_the_matching_item_list(pool, monkeypatch):
    generation(monkeypatch, {"success": True, "quizzes": [QUIZ], "count": 1})
    message = message_for("content.generation.requested", REQUEST)
    await consumer_for(pool, "content.generation.requested", gh.on_generation_requested).handle_message(message)
    (event,) = await outbox_events(pool)
    assert event["type"] == "ai.generation.completed"
    assert event["data"] == {"jobId": "job1", "type": "quiz", "items": {"quizzes": [QUIZ], "flashcards": []}}


async def test_generation_not_ready_retries_then_fails_with_a_refundable_reason(pool, monkeypatch):
    generation(monkeypatch, error=gh.DocumentNotReadyError("st1"))
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"content.generation.requested": gh.on_generation_requested}, publisher)
    await consumer.handle_message(message_for("content.generation.requested", REQUEST))
    assert len(publisher.published) == 1 and await outbox_events(pool) == []
    await consumer.handle_message(
        message_for("content.generation.requested", REQUEST, headers={"x-retry-count": MAX_RETRIES})
    )
    (event,) = await outbox_events(pool)
    assert event["type"] == "ai.generation.failed"
    assert event["data"] == {"jobId": "job1", "reason": "DOCUMENT_NOT_PROCESSED"}


async def test_generation_that_yields_nothing_fails_without_retry(pool, monkeypatch):
    generation(monkeypatch, {"success": False, "error": "Failed to generate any questions"})
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"content.generation.requested": gh.on_generation_requested}, publisher)
    await consumer.handle_message(message_for("content.generation.requested", REQUEST))
    assert publisher.published == []
    assert (await outbox_events(pool))[0]["data"] == {"jobId": "job1", "reason": "GENERATION_FAILED"}


async def test_generation_model_outage_retries(pool, monkeypatch):
    generation(monkeypatch, {"success": False, "error": "down", "error_code": "MODEL_UNAVAILABLE"})
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"content.generation.requested": gh.on_generation_requested}, publisher)
    await consumer.handle_message(message_for("content.generation.requested", REQUEST))
    assert len(publisher.published) == 1 and await outbox_events(pool) == []


@pytest.mark.parametrize(
    ("patch", "reason"),
    [({"type": "essay"}, "INVALID_TYPE"), ({"options": {"numItems": 0}}, "INVALID_OPTIONS"), ({"options": None}, "INVALID_OPTIONS")],
)
async def test_generation_bad_request_fails_the_job_instead_of_dead_lettering(pool, monkeypatch, patch, reason):
    generation(monkeypatch, {"success": True})
    message = message_for("content.generation.requested", {**REQUEST, **patch})
    await consumer_for(pool, "content.generation.requested", gh.on_generation_requested).handle_message(message)
    assert message.acked
    assert (await outbox_events(pool))[0]["data"] == {"jobId": "job1", "reason": reason}


async def test_generation_result_over_512kb_fails_the_job(pool, monkeypatch):
    big = {**QUIZ, "question": "x" * (600 * 1024)}
    generation(monkeypatch, {"success": True, "quizzes": [big], "count": 1})
    await consumer_for(pool, "content.generation.requested", gh.on_generation_requested).handle_message(
        message_for("content.generation.requested", REQUEST)
    )
    assert (await outbox_events(pool))[0]["data"]["reason"] == "RESULT_TOO_LARGE"


async def test_flashcard_generation_populates_flashcards(pool, monkeypatch):
    card = {"question": "q", "answer": "a", "sourcePageRange": "2"}

    async def fake(kind, *args):
        return {"success": True, "flashcards": [card], "count": 1}

    monkeypatch.setattr(gh, "_generate", fake)
    await consumer_for(pool, "content.generation.requested", gh.on_generation_requested).handle_message(
        message_for("content.generation.requested", {**REQUEST, "type": "flashcard"})
    )
    assert (await outbox_events(pool))[0]["data"]["items"] == {"quizzes": [], "flashcards": [card]}


class _Model:
    id = "fake-model"


async def test_process_stores_chunks_in_the_ai_schema_and_skips_ocr_when_already_done(pool, monkeypatch):
    """Real DB + real vector store; only the OCR and the embedding model are faked."""
    from types import SimpleNamespace

    from src import db
    from src.backend.services.ocr_service import ocr_service
    from src.rag import vector_store_pg

    monkeypatch.setenv("DATABASE_URL", os.environ["AI_TEST_DATABASE_URL"])
    monkeypatch.setattr(dh, "model_manager", SimpleNamespace(resolve_model=lambda _: _Model()))
    prepared = []

    async def fake_prepare(user_storage_id, file_info):
        prepared.append((user_storage_id, file_info.filename, file_info.mimetype, file_info.url))
        return [
            {"id": f"{user_storage_id}_chunk_{i}", "user_storage_id": user_storage_id, "content": f"text {i}",
             "page_range": str(1 + i // 2), "title": f"Chunk {i + 1}"}
            for i in range(3)
        ]

    async def fake_embed(self, texts, task_type="retrieval_document", model_type=None):
        return [[0.1, 0.2, 0.3] for _ in texts]

    monkeypatch.setattr(ocr_service, "prepare_documents_to_store", fake_prepare)
    monkeypatch.setattr(vector_store_pg.PgVectorStore, "create_embeddings_batch", fake_embed)
    monkeypatch.setattr(dh, "_extract_entities", lambda storage_id: _noop())
    try:
        assert await dh._process("st9", "a.pdf", "application/pdf", "https://f/a.pdf") == 2  # pages 1 and 2
        assert await pool.fetchval('SELECT count(*) FROM "Document" WHERE "userStorageId" = \'st9\'') == 3
        assert await dh._process("st9", "a.pdf", "application/pdf", "https://f/a.pdf") == 2  # re-emitted event
        assert len(prepared) == 1  # no second OCR run
    finally:
        await db.close_pools()


async def _noop() -> None:
    return None
