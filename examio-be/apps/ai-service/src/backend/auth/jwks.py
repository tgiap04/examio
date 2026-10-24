"""JWKS fetching and caching for service-token verification.

The key set is cached; an unknown ``kid`` on a warm cache means the auth service
rotated its signing key, which triggers ONE refetch, rate limited by a cooldown
so a stream of random ``kid`` values cannot hammer the auth service.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

JWKS_CACHE_SECONDS = 600.0
JWKS_REFETCH_COOLDOWN_SECONDS = 30.0
JWKS_TIMEOUT_SECONDS = 3.0


class JwksError(Exception):
    """The key for a ``kid`` could not be obtained (unknown kid or auth unreachable)."""


JwksFetcher = Callable[[], Awaitable[list[dict[str, Any]]]]


def http_jwks_fetcher(url: str) -> JwksFetcher:
    """Return a fetcher that reads the JWKS document at ``url``."""

    async def fetch() -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=JWKS_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
            response.raise_for_status()
            keys = response.json().get("keys")
        if not isinstance(keys, list):
            raise ValueError("JWKS document has no keys array")
        return keys

    return fetch


class JwksCache:
    """Caches a JWKS and refetches it once on an unknown ``kid`` (rate limited)."""

    def __init__(
        self,
        fetch: JwksFetcher,
        cooldown_seconds: float = JWKS_REFETCH_COOLDOWN_SECONDS,
        cache_seconds: float = JWKS_CACHE_SECONDS,
    ) -> None:
        """Cache ``fetch`` results for ``cache_seconds``; kid-miss refetches wait ``cooldown_seconds``."""
        self._fetch = fetch
        self._cooldown = cooldown_seconds
        self._cache_seconds = cache_seconds
        self._keys: dict[str, dict[str, Any]] = {}
        self._fetched_at: float | None = None

    async def _refresh(self) -> None:
        try:
            keys = await self._fetch()
        except Exception as exc:  # fail closed, leave a trace for operators
            logger.warning("JWKS lookup failed: %s", exc)
            raise JwksError("JWKS unavailable") from exc
        self._keys = {k["kid"]: k for k in keys if isinstance(k, dict) and k.get("kid")}
        self._fetched_at = time.monotonic()

    async def key_for(self, kid: str) -> dict[str, Any]:
        """Return the JWK for ``kid`` or raise :class:`JwksError`."""
        now = time.monotonic()
        stale = self._fetched_at is None or now - self._fetched_at > self._cache_seconds
        if stale:
            await self._refresh()
        elif kid not in self._keys and now - (self._fetched_at or 0) >= self._cooldown:
            await self._refresh()
        key = self._keys.get(kid)
        if key is None:
            raise JwksError("unknown kid")
        return key
