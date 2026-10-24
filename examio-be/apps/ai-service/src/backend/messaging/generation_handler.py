"""Handler for ``content.generation.requested``.

Generates quiz / flashcard items from an already processed document and answers
with ``ai.generation.completed {jobId, type, items}`` (kept under 512 KB inline)
or ``ai.generation.failed {jobId, reason}``.

A document without chunks yet is processed inline when the event carries a
presigned ``downloadUrl`` (+ ``mimetype``): the same download (SSRF guard) -> OCR
-> chunk -> embed pipeline as ``document.uploaded``, then the generation, so a job
never depends on the OCR queue finishing first. The outcome of that processing is
also reported (``ai.document.processed`` / ``ai.document.failed``) so
document-service learns it. A failure retrying cannot fix fails the job at once
with the processing reason (refundable); a transient one is retried like any other.

Without a ``downloadUrl`` the caller ensures processing first (document-service
``EnsureProcessed`` re-emits ``document.uploaded``); until chunks appear the
event is retried by the consumer, and on the last attempt the job fails with
``DOCUMENT_NOT_PROCESSED`` so exam/content can refund it.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from . import document_handlers, outbox
from .delivery import HandlerContext
from .errors import PermanentEventError
from .payload import optional_text, required_text

logger = logging.getLogger(__name__)

MAX_INLINE_BYTES = 512 * 1024
MAX_ITEMS = 50
TRANSIENT_MODEL_CODES = frozenset({"MODEL_UNAVAILABLE", "MODEL_INSUFFICIENT_VRAM", "MODEL_RUNTIME_ERROR"})
# Model codes reported as the job's failure reason; any other failure is GENERATION_FAILED.
MODEL_FAILURE_CODES = TRANSIENT_MODEL_CODES | {"MODEL_CONFIGURATION_ERROR"}


class DocumentNotReadyError(Exception):
    """The document has no chunks yet (processing pending or failed)."""


class InlineProcessingFailedError(Exception):
    """Processing the document inline failed for a reason retrying cannot fix."""

    def __init__(self, reason: str) -> None:
        """Keep the failure code the job is failed with."""
        super().__init__(reason)
        self.reason = reason


InlineProcessor = Callable[[], Awaitable[None]]


def _options(data: dict[str, Any]) -> tuple[int, bool, str | None]:
    options = data.get("options")
    if not isinstance(options, dict):
        raise PermanentEventError("INVALID_PAYLOAD", "options must be an object")
    count = options.get("numItems")
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= MAX_ITEMS:
        raise PermanentEventError("INVALID_PAYLOAD", f"options.numItems must be 1..{MAX_ITEMS}")
    return count, bool(options.get("isNarrowSearch")), optional_text(options.get("keyword"))


def _download(data: dict[str, Any]) -> tuple[str, str] | None:
    """Return the optional ``(downloadUrl, mimetype)`` pair; both are needed to process the document here."""
    url, mimetype = optional_text(data.get("downloadUrl")), optional_text(data.get("mimetype"))
    return (url, mimetype) if url and mimetype else None


def _inline_processor(ctx: HandlerContext, storage_id: str, url: str, mimetype: str) -> InlineProcessor:
    """Process the document from its presigned URL and report the outcome like ``document.uploaded`` does."""

    async def run() -> None:
        corr = ctx.envelope.correlationId
        try:
            # The event carries no filename and the pipeline only reads the mimetype and the URL.
            pages = await document_handlers._process(storage_id, storage_id, mimetype, url)
        except Exception as exc:
            reason = document_handlers.failure_reason(exc)
            if reason is None:
                raise  # transient: the consumer retries the whole generation
            logger.error("Inline processing of %s failed (%s): %s", storage_id, reason, exc)
            await outbox.add(ctx.conn, "ai.document.failed", {"storageId": storage_id, "reason": reason}, corr)
            raise InlineProcessingFailedError(reason) from exc
        await outbox.add(ctx.conn, "ai.document.processed", {"storageId": storage_id, "pageCount": pages}, corr)

    return run


async def _generate(
    kind: str,
    storage_id: str,
    count: int,
    narrow: bool,
    keyword: str | None,
    model: str | None,
    inline: InlineProcessor | None = None,
):
    from src.backend.services.generation_service import (
        GenerateFlashcardRequest,
        GenerateQuizRequest,
        generation_service,
    )
    from src.backend.services.ocr_service import ocr_service

    if not await ocr_service.get_document_chunks(storage_id):
        if inline is None:
            raise DocumentNotReadyError(storage_id)
        await inline()
    common = {"user_storage_id": storage_id, "is_narrow_search": narrow, "keyword": keyword, "model_type": model}
    if kind == "quiz":
        return await generation_service.generate_quiz(GenerateQuizRequest(num_questions=count, **common))
    return await generation_service.generate_flashcards(GenerateFlashcardRequest(num_flashcards=count, **common))


async def _fail(ctx: HandlerContext, job_id: str, reason: str) -> None:
    logger.warning("Generation job %s failed: %s", job_id, reason)
    await outbox.add(ctx.conn, "ai.generation.failed", {"jobId": job_id, "reason": reason}, ctx.envelope.correlationId)


async def on_generation_requested(ctx: HandlerContext) -> None:
    """Run one generation job and publish its outcome through the outbox."""
    data = ctx.envelope.data
    job_id, storage_id = required_text(data, "jobId"), required_text(data, "storageId")
    kind = required_text(data, "type")
    if kind not in ("quiz", "flashcard"):
        await _fail(ctx, job_id, "INVALID_TYPE")
        return
    try:
        count, narrow, keyword = _options(data)
    except PermanentEventError:
        await _fail(ctx, job_id, "INVALID_OPTIONS")
        return
    model = optional_text(data.get("model"))
    download = _download(data)
    # Only passed when there is something to process from, so the plain path is unchanged.
    extra = {"inline": _inline_processor(ctx, storage_id, *download)} if download else {}

    try:
        result = await _generate(kind, storage_id, count, narrow, keyword, model, **extra)
    except InlineProcessingFailedError as exc:
        await _fail(ctx, job_id, exc.reason)
        return
    except DocumentNotReadyError:
        if not ctx.is_last_attempt:
            raise
        await _fail(ctx, job_id, "DOCUMENT_NOT_PROCESSED")
        return
    except Exception as exc:  # unexpected: transient until the retry budget is spent
        if not ctx.is_last_attempt:
            raise
        logger.error("Generation job %s crashed: %s", job_id, exc, exc_info=True)
        await _fail(ctx, job_id, "GENERATION_ERROR")
        return

    if not result.get("success"):
        code = result.get("error_code")
        if code in TRANSIENT_MODEL_CODES and not ctx.is_last_attempt:
            raise RuntimeError(f"model unavailable: {code}")  # retry later
        await _fail(ctx, job_id, code if code in MODEL_FAILURE_CODES else "GENERATION_FAILED")
        return

    items = {
        "quizzes": result.get("quizzes", []) if kind == "quiz" else [],
        "flashcards": result.get("flashcards", []) if kind == "flashcard" else [],
    }
    payload = {"jobId": job_id, "type": kind, "items": items}
    if len(json.dumps(payload).encode()) > MAX_INLINE_BYTES:
        await _fail(ctx, job_id, "RESULT_TOO_LARGE")
        return
    await outbox.add(ctx.conn, "ai.generation.completed", payload, ctx.envelope.correlationId)
