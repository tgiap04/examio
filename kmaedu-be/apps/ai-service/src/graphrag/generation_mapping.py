"""Map each generated item back to the concept slot it was written for.

The model is asked to echo the slot's name in ``concept``. An item is matched by that name
(normalised); a name nobody matches (or a missing one) is matched to the nearest unused slot
by embedding, if that is close enough. An item that matches nothing keeps no ``concept`` and
is left to the cosine duplicate check. Afterwards ``concept`` holds the slot *key*, so two
items for the same slot share a key and the :class:`~src.graphrag.dedupe.Deduper` drops the
second.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from .embeddings import Embedder, embed_texts
from .generation_planner import Slot
from .types import normalize_name

logger = logging.getLogger(__name__)

MIN_COSINE = 0.75  # below this a nearest slot is a guess, and a wrong guess would drop a good item


def _slot_text(slot: Slot) -> str:
    return f"{slot.name}: {slot.description}" if slot.description else slot.name


def _unit(rows: list[list[float]]) -> np.ndarray:
    mat = np.asarray(rows, dtype=np.float64)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    return np.divide(mat, norms, out=np.zeros_like(mat), where=norms > 0)


async def _nearest(items: list[dict[str, Any]], slots: list[Slot], embedder: Embedder | None) -> list[Slot | None]:
    """Nearest slot per item (by its concept text, else its question); ``None`` below :data:`MIN_COSINE`."""
    if embedder is None or not slots:
        return [None] * len(items)
    queries = [str(i.get("concept") or i.get("question") or "") for i in items]
    try:
        vectors = _unit(await embed_texts(embedder, [*queries, *(_slot_text(s) for s in slots)]))
    except Exception as exc:  # mapping is best effort; the item is kept either way
        logger.warning("[GRAPHRAG_GEN] could not embed concepts (%s); leaving them unmapped", exc)
        return [None] * len(items)
    sims = vectors[: len(items)] @ vectors[len(items):].T
    best = sims.argmax(axis=1)
    return [slots[b] if sims[n, b] >= MIN_COSINE else None for n, b in enumerate(best)]


async def assign_slots(items: list[dict[str, Any]], slots: list[Slot], embedder: Embedder | None) -> None:
    """Rewrite ``concept`` of ``items`` (generated from one batch of ``slots``) to a slot key, or drop it."""
    by_name: dict[str, list[Slot]] = {}
    for slot in slots:
        by_name.setdefault(normalize_name(slot.name), []).append(slot)
    taken: set[str] = set()
    unresolved: list[dict[str, Any]] = []
    for item in items:
        named = by_name.get(normalize_name(str(item["concept"]))) if item.get("concept") else None
        if not named:
            unresolved.append(item)
            continue
        free = next((s for s in named if s.key not in taken), None)
        slot = free or named[-1]  # every slot of this name is used: a repeat, same key as the last
        taken.add(slot.key)
        item["concept"] = slot.key
    if unresolved:
        free_slots = [s for s in slots if s.key not in taken]
        for item, slot in zip(unresolved, await _nearest(unresolved, free_slots, embedder), strict=True):
            if slot is None:
                item.pop("concept", None)
            else:
                item["concept"] = slot.key  # two items nearest to one slot share its key: the second is a repeat
