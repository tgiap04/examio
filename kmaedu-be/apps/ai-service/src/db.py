"""Shared PostgreSQL access for the ai-service.

The service connects as the ``ai_svc`` role and owns the ``ai`` schema. Every
caller shares ONE asyncpg pool (``max_size=5``); the outbox relay gets its own
small pool (``max_size=2``) so relay load never starves the request path. The
``ai_svc`` role has ``CONNECTION LIMIT 40`` (deploy/postgres/init), which a
worker (5 + 2) and an api process (5) stay far below.

``search_path`` is pinned on every connection (``DB_SEARCH_PATH``, default
``ai,extensions``) because asyncpg does not read the role-level setting through
a connection URL that carries no ``?schema=`` option.
"""

from __future__ import annotations

import asyncio
import logging
import os

import asyncpg

logger = logging.getLogger(__name__)

DEFAULT_SEARCH_PATH = "ai,extensions"
POOL_MAX_SIZE = 5
RELAY_POOL_MAX_SIZE = 2

_pools: dict[str, asyncpg.Pool] = {}
_lock: asyncio.Lock | None = None


def pg_server_settings() -> dict[str, str]:
    """Return the ``server_settings`` mapping for ``asyncpg.create_pool``."""
    search_path = os.environ.get("DB_SEARCH_PATH", "").strip() or DEFAULT_SEARCH_PATH
    return {"search_path": search_path}


def database_url() -> str:
    """Return ``DATABASE_URL`` or fail loudly when it is not configured."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise ValueError("DATABASE_URL environment variable not set")
    return url


async def _get_or_open(name: str, max_size: int) -> asyncpg.Pool:
    global _lock
    pool = _pools.get(name)
    if pool is not None and not pool._closed:
        return pool
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        pool = _pools.get(name)
        if pool is None or pool._closed:
            pool = await asyncpg.create_pool(
                database_url(),
                min_size=1,
                max_size=max_size,
                command_timeout=60,
                server_settings=pg_server_settings(),
            )
            _pools[name] = pool
            logger.info("PostgreSQL pool %r opened (max_size=%d)", name, max_size)
        return pool


async def get_pool() -> asyncpg.Pool:
    """Return the shared request/worker pool (created on first use)."""
    return await _get_or_open("main", POOL_MAX_SIZE)


async def get_relay_pool() -> asyncpg.Pool:
    """Return the outbox relay's own pool (created on first use)."""
    return await _get_or_open("relay", RELAY_POOL_MAX_SIZE)


async def close_pools() -> None:
    """Close every pool; safe to call more than once."""
    global _lock
    pools = list(_pools.values())
    _pools.clear()
    _lock = None
    for pool in pools:
        try:
            await pool.close()
        except Exception as exc:  # shutdown must not raise
            logger.warning("Pool did not close cleanly: %s", exc)
