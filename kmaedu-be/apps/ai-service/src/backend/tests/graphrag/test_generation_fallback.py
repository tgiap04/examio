"""Fallback batches: used when the GraphRAG index is not READY or has no communities."""

from datetime import datetime

from src.backend.services.ocr_service import DocumentChunk
from src.graphrag.generation_fallback import fallback_batches

NOW = datetime(2026, 1, 1)


def chunk(n, text=None, page=None):
    return DocumentChunk(f"c{n}", "s1", page or str(n), None, text or f"text {n}", NOW)


def test_chunks_are_split_evenly_in_page_order_and_items_add_up_exactly():
    chunks = [chunk(n) for n in (5, 1, 3, 2, 4, 6)]  # stored out of page order
    batches = fallback_batches(chunks, total=20, max_items=12)
    assert [size for _, size in batches] == [10, 10]
    assert [c.content for c, _ in batches] == ["text 1\n\ntext 2\n\ntext 3", "text 4\n\ntext 5\n\ntext 6"]
    assert [c.page_range for c, _ in batches] == ["1-3", "4-6"]


def test_every_call_stays_within_max_items_and_the_total_is_exact():
    batches = fallback_batches([chunk(n) for n in range(1, 40)], total=50, max_items=12)
    sizes = [size for _, size in batches]
    assert sum(sizes) == 50 and max(sizes) <= 12 and min(sizes) >= 1


def test_fewer_chunks_than_calls_share_chunks_instead_of_exceeding_max_items():
    batches = fallback_batches([chunk(1), chunk(2)], total=50, max_items=12)
    sizes = [size for _, size in batches]
    assert len(batches) == 5 and sum(sizes) == 50 and max(sizes) <= 12
    assert {merged.content for merged, _ in batches} <= {"text 1", "text 2", "text 1\n\ntext 2"}


def test_a_single_small_request_is_one_call_over_the_whole_document():
    ((merged, size),) = fallback_batches([chunk(n) for n in range(1, 5)], total=5, max_items=12)
    assert size == 5 and merged.page_range == "1-4" and merged.content.count("text") == 4


def test_oversized_batches_sample_chunks_evenly_within_the_char_budget():
    chunks = [chunk(n, text=f"{n}" * 1000) for n in range(1, 21)]
    ((merged, _),) = fallback_batches(chunks, total=5, max_items=12, max_chars=5000)
    assert len(merged.content) <= 5000 + 2 * 10
    assert merged.content.startswith("1" * 1000)
    assert merged.page_range.startswith("1-")


def test_no_chunks_no_batches_and_nonpositive_total():
    assert fallback_batches([], total=5, max_items=12) == []
    assert fallback_batches([chunk(1)], total=0, max_items=12) == []


def test_pages_without_digits_are_kept_in_stored_order():
    ((merged, _),) = fallback_batches([chunk(1, page="intro"), chunk(2, page="intro")], total=2, max_items=12)
    assert merged.page_range == "intro"
