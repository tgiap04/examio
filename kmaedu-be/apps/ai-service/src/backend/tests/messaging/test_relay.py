"""Outbox relay: claim in a short tx, publish outside it, mark afterwards."""

import json

from helpers import FakePublisher

from src.backend.messaging import outbox
from src.backend.messaging.outbox_relay import BATCH, OutboxRelay
from src.backend.messaging.topology import EVENTS_EXCHANGE


async def seed(pool, n: int = 1, type_: str = "ai.document.processed") -> list[str]:
    ids = []
    async with pool.acquire() as conn:
        for i in range(n):
            envelope = await outbox.add(conn, type_, {"storageId": f"s{i}", "pageCount": 1})
            ids.append(envelope.id)
    return ids


async def row(pool, event_id: str):
    return await pool.fetchrow("SELECT * FROM outbox_events WHERE id = $1", event_id)


async def test_published_rows_go_to_the_events_exchange_and_are_marked(pool):
    (event_id,) = await seed(pool)
    publisher = FakePublisher()

    assert await OutboxRelay(pool, publisher).tick() == 1

    (sent,) = publisher.published
    assert sent["exchange"] == EVENTS_EXCHANGE and sent["routing_key"] == "ai.document.processed"
    assert sent["message_id"] == event_id
    assert json.loads(sent["body"])["id"] == event_id and json.loads(sent["body"])["source"] == "ai"
    stored = await row(pool, event_id)
    assert stored["published_at"] is not None and stored["locked_until"] is None
    assert await OutboxRelay(pool, publisher).tick() == 0  # nothing left


async def test_rows_are_published_in_seq_order(pool):
    await seed(pool, 5)
    publisher = FakePublisher()
    await OutboxRelay(pool, publisher).tick()
    assert [json.loads(p["body"])["data"]["storageId"] for p in publisher.published] == [f"s{i}" for i in range(5)]


async def test_publish_happens_after_the_claim_tx_committed_and_holds_no_row_lock(pool):
    (event_id,) = await seed(pool)
    observed: dict = {}

    class Probe(FakePublisher):
        async def publish(self, *args, **kwargs):
            async with pool.acquire() as other:  # a different connection sees the committed claim
                observed["locked_until"] = await other.fetchval(
                    "SELECT locked_until FROM outbox_events WHERE id = $1", event_id
                )
                async with other.transaction():  # and can lock the row: the relay holds no lock
                    await other.fetchval("SELECT seq FROM outbox_events WHERE id = $1 FOR UPDATE NOWAIT", event_id)
            await super().publish(*args, **kwargs)

    await OutboxRelay(pool, Probe()).tick()
    assert observed["locked_until"] is not None


async def test_crash_after_claim_is_reclaimed_after_locked_until(pool):
    (event_id,) = await seed(pool)
    relay = OutboxRelay(pool, FakePublisher())
    # Simulate a relay that claimed and died before publishing: claim only.
    from src.backend.messaging.outbox_relay import CLAIM_SQL

    assert len(await pool.fetch(CLAIM_SQL, "ai")) == 1
    assert await relay.tick() == 0  # still locked: another relay owns it

    await pool.execute(
        "UPDATE outbox_events SET locked_until = (now() AT TIME ZONE 'UTC') - interval '1 second' WHERE id = $1",
        event_id,
    )
    publisher = FakePublisher()
    assert await OutboxRelay(pool, publisher).tick() == 1
    assert len(publisher.published) == 1 and (await row(pool, event_id))["published_at"] is not None


async def test_publish_failure_marks_the_attempt_and_backs_off(pool):
    (event_id,) = await seed(pool)
    assert await OutboxRelay(pool, FakePublisher(fail=True)).tick() == 1
    failed = await row(pool, event_id)
    assert failed["published_at"] is None and failed["locked_until"] is None
    assert failed["attempts"] == 1 and "broker unavailable" in failed["last_error"]
    assert failed["next_attempt_at"] > await pool.fetchval("SELECT now() AT TIME ZONE 'UTC'")
    assert await OutboxRelay(pool, FakePublisher()).tick() == 0  # backoff: not due yet


async def test_mixed_batch_only_marks_the_failures(pool):
    ids = await seed(pool, 2)

    class FailSecond(FakePublisher):
        async def publish(self, exchange, routing_key, body, **kwargs):
            if json.loads(body)["data"]["storageId"] == "s1":
                raise TimeoutError("confirm timed out")
            await super().publish(exchange, routing_key, body, **kwargs)

    await OutboxRelay(pool, FailSecond()).tick()
    assert (await row(pool, ids[0]))["published_at"] is not None
    assert (await row(pool, ids[1]))["published_at"] is None and (await row(pool, ids[1]))["attempts"] == 1


async def test_only_rows_of_its_own_source_are_relayed(pool):
    await seed(pool)
    await pool.execute("UPDATE outbox_events SET source = 'document'")
    assert await OutboxRelay(pool, FakePublisher()).tick() == 0


async def test_batch_is_capped(pool):
    await seed(pool, BATCH + 5)
    assert await OutboxRelay(pool, FakePublisher()).tick() == BATCH
