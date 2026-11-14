"""The shared pool module replaces the five per-service pools."""

import pytest

from src import db


def test_search_path_defaults_to_ai_and_extensions(monkeypatch):
    monkeypatch.delenv("DB_SEARCH_PATH", raising=False)
    assert db.pg_server_settings() == {"search_path": "ai,extensions"}


def test_search_path_is_overridable_and_blank_falls_back(monkeypatch):
    monkeypatch.setenv("DB_SEARCH_PATH", "other,extensions")
    assert db.pg_server_settings() == {"search_path": "other,extensions"}
    monkeypatch.setenv("DB_SEARCH_PATH", "  ")
    assert db.pg_server_settings() == {"search_path": "ai,extensions"}


def test_pool_sizes_fit_the_ai_svc_connection_limit():
    assert db.POOL_MAX_SIZE == 5 and db.RELAY_POOL_MAX_SIZE == 2
    assert 2 * (db.POOL_MAX_SIZE + db.RELAY_POOL_MAX_SIZE) <= 40  # api + worker replicas vs CONNECTION LIMIT 40


def test_missing_database_url_fails_loudly(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="DATABASE_URL"):
        db.database_url()


async def test_one_shared_pool_and_a_separate_relay_pool(migrated, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", migrated)
    monkeypatch.delenv("DB_SEARCH_PATH", raising=False)
    try:
        main, again, relay = await db.get_pool(), await db.get_pool(), await db.get_relay_pool()
        assert main is again and main is not relay
        assert main.get_max_size() == 5 and relay.get_max_size() == 2
        assert await main.fetchval("SHOW search_path") == "ai,extensions"
        assert await main.fetchval("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'ai'") >= 6
    finally:
        await db.close_pools()
    assert main._closed and relay._closed
    await db.close_pools()  # idempotent
