"""Slot data types, the share-out of slots over communities and their packing into model calls."""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field

from .types import TextUnitHit

ANGLES = ("definition", "application", "comparison")  # reuse order once a target is used
RELATIONSHIP_ANGLE = "relationship"


@dataclass(frozen=True)
class Slot:
    """One question or card: a target entity or relationship, an angle and its evidence."""

    key: str
    name: str
    description: str
    angle: str
    community_id: str | None
    community_title: str
    evidence: tuple[TextUnitHit, ...] = ()


@dataclass(frozen=True)
class SlotBatch:
    """Slots sent to the model in one call."""

    slots: list[Slot] = field(default_factory=list)


def allocate(total: int, weights: list[float]) -> list[int]:
    """Split ``total`` over ``weights``: exact sum, one each while ``total`` lasts, rest by weight."""
    count = len(weights)
    if total <= 0 or count == 0:
        return [0] * count
    order = sorted(range(count), key=lambda i: (-weights[i], i))
    if total <= count:
        chosen = set(order[:total])
        return [1 if i in chosen else 0 for i in range(count)]
    spare = total - count
    shares = [spare * w / sum(weights) for w in weights]
    shares_floor = [int(s) for s in shares]
    for i in sorted(range(count), key=lambda i: (-(shares[i] - shares_floor[i]), i))[: spare - sum(shares_floor)]:
        shares_floor[i] += 1
    return [1 + extra for extra in shares_floor]


def pack(slots: list[Slot], max_batch: int) -> list[SlotBatch]:
    """Pack slots into calls of at most ``max_batch``; a community's slots stay together when they fit."""
    batches: list[list[Slot]] = []
    current: list[Slot] = []
    for _, members in itertools.groupby(slots, key=lambda s: s.community_id):
        group = list(members)
        if current and len(current) + len(group) > max_batch:
            batches.append(current)
            current = []
        while len(group) > max_batch:
            batches.append(group[:max_batch])
            group = group[max_batch:]
        current += group
    if current:
        batches.append(current)
    return [SlotBatch(b) for b in batches]
