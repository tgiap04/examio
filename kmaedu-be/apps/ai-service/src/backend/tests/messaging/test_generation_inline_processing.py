"""``content.generation.requested`` with a ``downloadUrl``: process a chunk-less document inline.

Only the OCR/embedding pipeline (``document_handlers._process``), the chunk lookup and the model are
faked; the handler, the consumer and the outbox are real.
"""

from __future__ import annotations

import json

import pytest
from helpers import FakePublisher, message_for

from src.backend.messaging import document_handlers as dh
from src.backend.messaging import generation_handler as gh
from src.backend.messaging.consumer import EventConsumer
from src.backend.messaging.topology import MAX_RETRIES

URL = "https://files.example/st1.pdf?sig=1"
REQUEST = {
    "jobId": "job1",
    "userId": "u1",
    "storageId": "st1",
    "type": "quiz",
    "options": {"numItems": 2, "isNarrowSearch": False},
    "model": "",
}
WITH_URL = {**REQUEST, "downloadUrl": URL, "mimetype": "application/pdf"}
QUIZ = {"question": "q", "options": ["a", "b", "c", "d"], "answer": "a", "sourcePageRange": "1"}
KEY = "content.generation.requested"


async def outbox_events(pool) -> list[dict]:
    rows = await pool.fetch("SELECT envelope FROM outbox_events ORDER BY seq")
    return [json.loads(r["envelope"]) for r in rows]


class Fakes:
    """What the handler reaches for: the chunk table, the OCR pipeline and the model."""

    def __init__(self, monkeypatch, *, chunks: bool, process=None, result=None):
        from src.backend.services.generation_service import generation_service
        from src.backend.services.ocr_service import ocr_service

        self.processed: list[tuple] = []
        self.generated: list[str] = []
        self._chunks = chunks

        async def get_chunks(storage_id):
            return [object()] if self._chunks else []

        async def fake_process(storage_id, filename, mimetype, url):
            self.processed.append((storage_id, mimetype, url))
            if process is not None:
                return await process()
            self._chunks = True  # the pipeline stored the chunks
            return 3

        async def generate_quiz(request):
            self.generated.append(request.user_storage_id)
            return result or {"success": True, "quizzes": [QUIZ], "count": 1}

        monkeypatch.setattr(ocr_service, "get_document_chunks", get_chunks)
        monkeypatch.setattr(dh, "_process", fake_process)
        monkeypatch.setattr(generation_service, "generate_quiz", generate_quiz)


def consumer_for(pool, publisher=None):
    return EventConsumer(pool, {KEY: gh.on_generation_requested}, publisher or FakePublisher())


async def test_no_chunks_and_a_download_url_processes_the_document_then_generates(pool, monkeypatch):
    fakes = Fakes(monkeypatch, chunks=False)
    message = message_for(KEY, WITH_URL)
    await consumer_for(pool).handle_message(message)

    assert message.acked
    assert fakes.processed == [("st1", "application/pdf", URL)]
    assert fakes.generated == ["st1"]
    processed, completed = await outbox_events(pool)
    assert processed["type"] == "ai.document.processed" and processed["source"] == "ai"
    assert processed["data"] == {"storageId": "st1", "pageCount": 3}
    assert completed["type"] == "ai.generation.completed"
    assert completed["data"] == {"jobId": "job1", "type": "quiz", "items": {"quizzes": [QUIZ], "flashcards": []}}


async def test_existing_chunks_are_used_as_they_are_even_with_a_download_url(pool, monkeypatch):
    fakes = Fakes(monkeypatch, chunks=True)
    await consumer_for(pool).handle_message(message_for(KEY, WITH_URL))

    assert fakes.processed == []
    assert [e["type"] for e in await outbox_events(pool)] == ["ai.generation.completed"]


async def test_without_a_download_url_the_old_behaviour_stays_retry_then_a_refundable_failure(pool, monkeypatch):
    fakes = Fakes(monkeypatch, chunks=False)
    publisher = FakePublisher()
    consumer = consumer_for(pool, publisher)

    await consumer.handle_message(message_for(KEY, REQUEST))
    assert len(publisher.published) == 1 and await outbox_events(pool) == []  # retried, nothing decided

    await consumer.handle_message(message_for(KEY, REQUEST, headers={"x-retry-count": MAX_RETRIES}))
    (event,) = await outbox_events(pool)
    assert event["type"] == "ai.generation.failed"
    assert event["data"] == {"jobId": "job1", "reason": "DOCUMENT_NOT_PROCESSED"}
    assert fakes.processed == [] and fakes.generated == []


@pytest.mark.parametrize("patch", [{"downloadUrl": URL}, {"mimetype": "application/pdf"}, {"downloadUrl": "", "mimetype": ""}])
async def test_a_download_url_and_a_mimetype_are_both_needed_to_process_inline(pool, monkeypatch, patch):
    """Both fields are needed to process the document: with only one the plain path applies."""
    fakes = Fakes(monkeypatch, chunks=False)
    publisher = FakePublisher()
    await consumer_for(pool, publisher).handle_message(message_for(KEY, {**REQUEST, **patch}))
    assert fakes.processed == [] and len(publisher.published) == 1  # retried like a document without a URL


async def test_a_permanent_processing_failure_fails_the_job_at_once_and_tells_document_service(pool, monkeypatch):
    from src.backend.services.ocr_service import DownloadValidationError

    async def rejected():
        raise DownloadValidationError("host not allowed")

    Fakes(monkeypatch, chunks=False, process=rejected)
    publisher = FakePublisher()
    message = message_for(KEY, WITH_URL)
    await consumer_for(pool, publisher).handle_message(message)

    assert message.acked and publisher.published == []  # no retry
    failed_doc, failed_job = await outbox_events(pool)
    assert failed_doc["type"] == "ai.document.failed"
    assert failed_doc["data"] == {"storageId": "st1", "reason": "DOWNLOAD_REJECTED"}
    assert failed_job["type"] == "ai.generation.failed"
    assert failed_job["data"] == {"jobId": "job1", "reason": "DOWNLOAD_REJECTED"}


async def test_a_transient_processing_failure_retries_and_on_the_last_attempt_fails_the_job(pool, monkeypatch):
    async def flaky():
        raise RuntimeError("embedding service timeout")

    fakes = Fakes(monkeypatch, chunks=False, process=flaky)
    publisher = FakePublisher()
    consumer = consumer_for(pool, publisher)

    await consumer.handle_message(message_for(KEY, WITH_URL))
    assert len(publisher.published) == 1 and await outbox_events(pool) == []  # rolled back, retried

    await consumer.handle_message(message_for(KEY, WITH_URL, headers={"x-retry-count": MAX_RETRIES}))
    (event,) = await outbox_events(pool)
    assert event["type"] == "ai.generation.failed" and event["data"]["reason"] == "GENERATION_ERROR"
    assert fakes.generated == []
