"""Alembic baseline: upgrade head on an empty schema, hand-written DDL, downgrade."""

from conftest import run_alembic

EXPECTED = {
    "Document", "DocumentEntity", "UserStorageGraph", "UserStorageGraphGroup",
    "outbox_events", "processed_events", "alembic_version",
}
TABLES = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'ai'"


async def test_upgrade_head_on_an_empty_schema_then_downgrade_then_upgrade(database_url, pool):
    assert run_alembic(database_url, "downgrade", "base").returncode == 0
    assert {r["table_name"] for r in await pool.fetch(TABLES)} <= {"alembic_version"}  # empty schema

    up = run_alembic(database_url, "upgrade", "head")
    assert up.returncode == 0, up.stderr
    assert {r["table_name"] for r in await pool.fetch(TABLES)} == EXPECTED
    assert await pool.fetchval("SELECT version_num FROM ai.alembic_version") == "0001"
    assert run_alembic(database_url, "upgrade", "head").returncode == 0  # idempotent at head


async def test_baseline_keeps_the_columns_the_service_queries_rely_on(database_url, pool):
    run_alembic(database_url, "upgrade", "head")
    udt = "SELECT udt_name, udt_schema FROM information_schema.columns WHERE table_schema='ai' AND table_name='Document' AND column_name='embeddings'"
    row = await pool.fetchrow(udt)
    assert (row["udt_name"], row["udt_schema"]) == ("vector", "extensions")  # pgvector from the shared schema
    fks = await pool.fetch(
        "SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname='ai' AND contype='f'"
    )
    assert [f["conname"] for f in fks] == ["UserStorageGraphGroup_graphId_fkey"]  # no FK to UserStorage
    indexes = {r["indexname"] for r in await pool.fetch("SELECT indexname FROM pg_indexes WHERE schemaname='ai'")}
    assert {"Document_userStorageId_createdAt_idx", "UserStorageGraph_userStorageId_key", "outbox_events_unpublished_idx"} <= indexes


async def test_role_cannot_read_another_services_schema(pool):
    import asyncpg
    import pytest

    with pytest.raises(asyncpg.PostgresError):
        await pool.fetchval('SELECT 1 FROM auth."User"')
