"""Deterministic stand-ins for the embedding model used by the GraphRAG tests.

Test modules import ``fake_embedder`` from here (a fixture), like the root conftest
puts ``auth/`` and ``messaging/`` helpers on the path: a second ``conftest.py`` would
shadow the root one for ``from conftest import ...``.
"""

import hashlib

import pytest

DIM = 64


def vector_for(text: str) -> list[float]:
    """Stable pseudo-random vector: distinct texts land far below any merge threshold."""
    digest = hashlib.sha256(text.encode()).digest() + hashlib.sha256(text.encode()[::-1]).digest()
    return [b - 127.5 for b in digest]


@pytest.fixture(name="fake_embedder")
def embedder_fixture():
    """``Embedder`` that records its calls in ``.calls`` (one list of texts per call)."""

    async def embed(texts: list[str]) -> list[list[float]]:
        embed.calls.append(list(texts))
        return [vector_for(t) for t in texts]

    embed.calls = []
    return embed
