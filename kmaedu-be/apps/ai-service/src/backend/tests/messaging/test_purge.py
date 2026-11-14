"""Daily retention: published outbox rows > 7 d, processed_events > 14 d."""

from datetime import UTC, datetime

from helpers import FakePublisher

from src.backend.messaging import outbox
from src.backend.messaging.outbox_relay import OutboxRelay
from src.backend.messaging.purge import OutboxPurge, seconds_until_next_run

NOW = "(now() AT TIME ZONE 'UTC')"


async def test_purge_removes_only_expired_rows(pool):
    async with pool.acquire() as conn:
        for _ in range(3):
            await outbox.add(conn, "ai.document.processed", {"storageId": "s"})
    await OutboxRelay(pool, FakePublisher()).tick()  # all three published
    await pool.execute(
        f"UPDATE outbox_events SET published_at = {NOW} - interval '8 days' WHERE seq IN (1, 2)"
    )  # old; seq 3 stays fresh
    await pool.execute("INSERT INTO outbox_events (id, source, type, envelope) VALUES ('evt_unpub', 'ai', 'ai.x', '{}')")
    await pool.execute(
        f"INSERT INTO processed_events (consumer, event_id, processed_at) VALUES"
        f" ('ai', 'old', {NOW} - interval '15 days'), ('ai', 'new', {NOW} - interval '13 days')"
    )

    assert await OutboxPurge(pool).purge() == {"outbox": 2, "processed": 1}

    assert await pool.fetchval("SELECT count(*) FROM outbox_events") == 2  # fresh published + unpublished
    assert await pool.fetchval("SELECT array_agg(event_id) FROM processed_events") == ["new"]
    assert await OutboxPurge(pool).purge() == {"outbox": 0, "processed": 0}


def test_next_run_is_03_00_utc():
    assert seconds_until_next_run(datetime(2026, 10, 24, 2, 0, tzinfo=UTC)) == 3600
    assert seconds_until_next_run(datetime(2026, 10, 24, 3, 0, tzinfo=UTC)) == 86400
    assert seconds_until_next_run(datetime(2026, 10, 24, 23, 0, tzinfo=UTC)) == 4 * 3600
