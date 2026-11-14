"""Plain batches for quiz/flashcard generation when the GraphRAG index cannot be used.

The document's chunks are split evenly, in page order, into calls of at most ``max_items``
items. With fewer chunks than calls the calls share chunks.
"""

from __future__ import annotations

import re

from src.backend.services.ocr_service import DocumentChunk

MAX_BATCH_CHARS = 15000  # context kept per call; larger slices are sampled evenly
_DIGITS = re.compile(r"\d+")


def _pages(chunk: DocumentChunk) -> list[int]:
    return [int(n) for n in _DIGITS.findall(chunk.page_range or "")]


def _page_key(chunk: DocumentChunk) -> int:
    pages = _pages(chunk)
    return pages[0] if pages else 10**9


def _sample(part: list[DocumentChunk], max_chars: int) -> list[DocumentChunk]:
    chars = sum(len(c.content) for c in part)
    if chars <= max_chars:
        return part
    keep = max(1, len(part) * max_chars // chars)
    return [part[j * len(part) // keep] for j in range(keep)]


def page_label(ranges: list[str]) -> str:
    """Return ``"first-last"`` over every page number in ``ranges`` ("3", "3-5"), else the ranges joined."""
    pages = [int(n) for r in ranges for n in _DIGITS.findall(r or "")]
    return f"{min(pages)}-{max(pages)}" if pages else ",".join(dict.fromkeys(r for r in ranges if r))


def _merge(index: int, part: list[DocumentChunk]) -> DocumentChunk:
    label = page_label([c.page_range for c in part])
    return DocumentChunk(
        id=f"batch_{index}",
        user_storage_id=part[0].user_storage_id,
        page_range=label,
        title=f"Batch {index + 1}",
        content="\n\n".join(c.content for c in part),
        created_at=part[0].created_at,
    )


def fallback_batches(
    chunks: list[DocumentChunk], total: int, max_items: int, max_chars: int = MAX_BATCH_CHARS
) -> list[tuple[DocumentChunk, int]]:
    """Return ``(merged chunk, item count)`` per call; the counts add up to ``total``."""
    if not chunks or total <= 0:
        return []
    ordered = sorted(chunks, key=_page_key)  # stable: unnumbered pages keep their stored order
    calls = -(-total // max(1, max_items))
    base, extra = divmod(total, calls)
    batches = []
    for i in range(calls):
        start = i * len(ordered) // calls
        end = max(start + 1, (i + 1) * len(ordered) // calls)
        batches.append((_merge(i, _sample(ordered[start:end], max_chars)), base + (1 if i < extra else 0)))
    return batches
