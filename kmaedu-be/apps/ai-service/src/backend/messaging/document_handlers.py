"""Handlers for ``document.uploaded`` and ``document.deleted``.

``document.uploaded``: download -> OCR -> chunk -> embed -> queue the GraphRAG index
(``GraphIndex`` PENDING, built by the index worker) -> outbox ``ai.document.processed``.
A failure that retrying cannot fix publishes ``ai.document.failed`` straight away; a transient one raises so the
consumer retries, and on the last attempt publishes ``ai.document.failed`` so
document-service marks the row FAILED instead of waiting on the DLQ.

``document.deleted``: drop vectors, entities, legacy graph state and the GraphRAG
index in the same transaction as the idempotency record.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

import httpx

from src import db
from src.graphrag import indexer, store
from src.llm.model_manager import model_manager

from . import outbox
from .delivery import HandlerContext
from .errors import PermanentEventError
from .payload import required_text

logger = logging.getLogger(__name__)

DELETE_DOCUMENTS_SQL = 'DELETE FROM "Document" WHERE "userStorageId" = ANY($1::text[])'


def failure_reason(exc: Exception) -> str | None:
    """Return a failure code when retrying cannot help, else ``None`` (transient)."""
    from src.backend.services.ocr_service import (
        DownloadValidationError,
        FileExtractionError,
        NoContentExtractedError,
    )

    if isinstance(exc, DownloadValidationError):
        return "DOWNLOAD_REJECTED"
    if isinstance(exc, NoContentExtractedError):
        return "NO_CONTENT"
    if isinstance(exc, FileExtractionError):
        return "EXTRACTION_FAILED"
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if 400 <= status < 500 and status not in (408, 429):
            return "DOWNLOAD_FAILED"  # expired / missing presigned URL
    return None


async def _queue_graph_index(storage_id: str, chunks: Sequence[Any]) -> None:
    """Queue (re)building the GraphRAG index; a no-op while the same chunks are queued or built."""
    signature = indexer.chunk_signature((c.id, c.content) for c in chunks)
    await store.upsert_pending(await db.get_pool(), storage_id, signature)


async def _process(storage_id: str, filename: str, mimetype: str, url: str) -> int:
    """OCR + chunk + embed unless chunks already exist; returns the page count."""
    from src.backend.services.ocr_service import FileInfo, ocr_service, page_count_of
    from src.rag.vector_store_pg import get_pg_vector_store

    existing = await ocr_service.get_document_chunks(storage_id)
    if existing:  # re-emitted document.uploaded (EnsureProcessed): result is already there
        await _queue_graph_index(storage_id, existing)  # also covers documents stored before GraphRAG
        return page_count_of(existing)
    documents = await ocr_service.prepare_documents_to_store(
        user_storage_id=storage_id,
        file_info=FileInfo(id=storage_id, filename=filename, url=url, mimetype=mimetype),
    )
    model_id = model_manager.resolve_model(None).id
    stored = await get_pg_vector_store().store_documents_batch(documents, model_type=model_id)
    if stored == 0:
        raise RuntimeError("embedding/store produced no rows")  # transient: retry
    # Signature from what was really stored (the store may normalise content), not from `documents`.
    await _queue_graph_index(storage_id, await ocr_service.get_document_chunks(storage_id))
    return page_count_of(documents)


async def on_document_uploaded(ctx: HandlerContext) -> None:
    """Process an uploaded document and report the outcome through the outbox."""
    data = ctx.envelope.data
    storage_id = required_text(data, "storageId")
    url = required_text(data, "downloadUrl")
    filename, mimetype = required_text(data, "filename"), required_text(data, "mimetype")
    corr = ctx.envelope.correlationId
    try:
        pages = await _process(storage_id, filename, mimetype, url)
    except Exception as exc:
        reason = failure_reason(exc)
        if reason is None and not ctx.is_last_attempt:
            raise  # transient: let the consumer retry
        reason = reason or "PROCESSING_ERROR"
        logger.error("Document %s failed (%s): %s", storage_id, reason, exc, exc_info=reason == "PROCESSING_ERROR")
        await outbox.add(ctx.conn, "ai.document.failed", {"storageId": storage_id, "reason": reason}, corr)
        return
    await outbox.add(ctx.conn, "ai.document.processed", {"storageId": storage_id, "pageCount": pages}, corr)


async def on_document_deleted(ctx: HandlerContext) -> None:
    """Remove every artifact derived from the deleted storage ids."""
    ids = ctx.envelope.data.get("storageIds") if isinstance(ctx.envelope.data, dict) else None
    if not isinstance(ids, list) or not all(isinstance(i, str) and i for i in ids):
        raise PermanentEventError("INVALID_PAYLOAD", "storageIds must be a list of strings")
    if not ids:
        return
    await ctx.conn.execute(DELETE_DOCUMENTS_SQL, ids)
    await store.delete_for(ctx.conn, ids)
