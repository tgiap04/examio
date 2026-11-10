"""Alembic environment: async (asyncpg) engine, version table in schema ``ai``."""

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

VERSION_TABLE_SCHEMA = "ai"
# Same default as src/db.py: schema first, pgvector's schema second.
SEARCH_PATH = os.environ.get("DB_SEARCH_PATH", "").strip() or "ai,extensions"
target_metadata = None


def _database_url() -> str:
    raw = os.environ.get("DATABASE_URL", "").strip()
    if not raw:
        raise RuntimeError("DATABASE_URL environment variable not set")
    url = make_url(raw)
    if url.drivername in ("postgresql", "postgres"):
        url = url.set(drivername="postgresql+asyncpg")
    return url.render_as_string(hide_password=False)


def _configure(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=VERSION_TABLE_SCHEMA,
        include_schemas=False,
    )


def _run_migrations(connection: Connection) -> None:
    _configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async() -> None:
    engine = create_async_engine(
        _database_url(),
        poolclass=pool.NullPool,
        connect_args={"server_settings": {"search_path": SEARCH_PATH}},
    )
    async with engine.connect() as connection:
        await connection.run_sync(_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        version_table_schema=VERSION_TABLE_SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(_run_async())
