"""Pure metrics for the RAG quality eval (numpy only)."""

from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np

from src.graphrag.dedupe import duplicate_pairs


def duplicate_rate(vectors: Sequence[Sequence[float]] | np.ndarray, threshold: float = 0.88) -> float:
    """Fraction of items that sit in at least one duplicate pair (0.0 for fewer than 2 items)."""
    total = len(vectors)
    if total < 2:
        return 0.0
    members = {idx for pair in duplicate_pairs(vectors, threshold) for idx in pair}
    return len(members) / total


def _parse_range(text: object) -> tuple[int, int] | None:
    if not isinstance(text, str):
        return None
    parts = text.strip().split("-")
    try:
        nums = [int(p) for p in parts]
    except ValueError:
        return None
    if len(nums) == 1:
        start = end = nums[0]
    elif len(nums) == 2:
        start, end = nums
    else:
        return None
    if start < 1 or end < start:
        return None
    return start, end


def page_coverage(page_ranges: Iterable[object], total_pages: int) -> float:
    """Fraction of the document's pages touched by the given range strings ("3", "3-5")."""
    if total_pages < 1:
        return 0.0
    seen: set[int] = set()
    for raw in page_ranges:
        parsed = _parse_range(raw)
        if parsed is None:
            continue
        start, end = parsed
        seen.update(range(start, min(end, total_pages) + 1))
    return len(seen) / total_pages
