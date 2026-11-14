"""Drop generated quiz/flashcard items that repeat an earlier one.

Two items are duplicates when they carry the same ``concept`` (the slot they were generated
for) or when their questions are near-identical (cosine similarity at or above the
threshold). The earlier item wins. The cosine pairs helper is shared with the eval metrics.
"""

from __future__ import annotations

import logging
from typing import Any, Sequence

import numpy as np

from .embeddings import Embedder, embed_texts
from .types import normalize_name

logger = logging.getLogger(__name__)

DEFAULT_THRESHOLD = 0.9


def _unit_rows(vectors: Sequence[Sequence[float]] | np.ndarray) -> np.ndarray:
    mat = np.asarray(vectors, dtype=np.float64)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    return np.divide(mat, norms, out=np.zeros_like(mat), where=norms > 0)


def duplicate_pairs(vectors: Sequence[Sequence[float]] | np.ndarray, threshold: float) -> list[tuple[int, int]]:
    """Return index pairs ``(i, j)``, ``i < j``, whose cosine similarity is >= ``threshold``."""
    mat = np.asarray(vectors, dtype=np.float64)
    if mat.ndim != 2 or mat.shape[0] < 2:
        return []
    unit = _unit_rows(mat)
    sim = unit @ unit.T
    rows, cols = np.triu_indices(mat.shape[0], k=1)
    mask = sim[rows, cols] >= threshold
    return [(int(i), int(j)) for i, j in zip(rows[mask], cols[mask])]


class Deduper:
    """Stateful filter: what it kept in earlier calls counts as "earlier" for later calls.

    Without an embedder, or once embedding failed, only the concept rule applies (logged once).
    """

    def __init__(self, embedder: Embedder | None, threshold: float = DEFAULT_THRESHOLD) -> None:
        """Compare question embeddings from ``embedder`` (``None``: concept rule only) at ``threshold``."""
        self._embedder = embedder
        self._threshold = threshold
        self._concepts: set[str] = set()
        self._vectors: list[np.ndarray] = []
        self.embed_failed = embedder is None

    async def _embed(self, items: list[dict[str, Any]]) -> dict[int, np.ndarray]:
        """Return the unit vectors of the non-blank questions by item index; empty after a failure."""
        indexed = [(i, str(it.get("question") or "").strip()) for i, it in enumerate(items)]
        indexed = [(i, text) for i, text in indexed if text]
        if self.embed_failed or not indexed:
            return {}
        try:
            vectors = await embed_texts(self._embedder, [text for _, text in indexed])
        except Exception as exc:  # duplicates are a quality filter; never fail the generation over it
            logger.warning("[GRAPHRAG_GEN] question embedding failed (%s); deduplicating by concept only", exc)
            self.embed_failed = True
            return {}
        units = _unit_rows(vectors)
        return {i: units[n] for n, (i, _) in enumerate(indexed)}

    def _is_near_duplicate(self, vector: np.ndarray) -> bool:
        return bool(self._vectors) and float((np.stack(self._vectors) @ vector).max()) >= self._threshold

    async def add(self, items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
        """Return ``(kept, dropped_count)`` for ``items`` in order, and remember what was kept."""
        vectors = await self._embed(items)
        kept: list[dict[str, Any]] = []
        for index, item in enumerate(items):
            concept = normalize_name(str(item["concept"])) if item.get("concept") else None
            vector = vectors.get(index)
            if concept in self._concepts or (vector is not None and self._is_near_duplicate(vector)):
                continue
            if concept:
                self._concepts.add(concept)
            if vector is not None and vector.any():
                self._vectors.append(vector)
            kept.append(item)
        return kept, len(items) - len(kept)
