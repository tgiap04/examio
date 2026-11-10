"""One event id delivered twice produces one effect (ledger + effect in one tx)."""

import json

from helpers import FakePublisher, message_for

from src.backend.messaging import outbox
from src.backend.messaging.consumer import EventConsumer, HandlerContext


async def count(pool, table: str) -> int:
    return await pool.fetchval(f"SELECT count(*) FROM {table}")


async def test_same_event_id_twice_runs_the_handler_once(pool):
    calls: list[str] = []

    async def handler(ctx: HandlerContext) -> None:
        calls.append(ctx.envelope.id)
        await outbox.add(ctx.conn, "ai.document.processed", {"storageId": "s1", "pageCount": 2})

    consumer = EventConsumer(pool, {"document.uploaded": handler}, FakePublisher())
    first = message_for("document.uploaded", {"storageId": "s1"})
    redelivery = type(first)(first.routing_key, first.body, {}, first.message_id)

    await consumer.handle_message(first)
    await consumer.handle_message(redelivery)

    assert calls == [first.message_id]
    assert first.acked and redelivery.acked and not redelivery.nacked
    assert await count(pool, "outbox_events") == 1
    assert await pool.fetchval("SELECT count(*) FROM processed_events WHERE consumer = 'ai'") == 1


async def test_failed_handler_rolls_back_effect_and_ledger_so_redelivery_runs_again(pool):
    attempts = {"n": 0}

    async def handler(ctx: HandlerContext) -> None:
        attempts["n"] += 1
        await outbox.add(ctx.conn, "ai.document.failed", {"storageId": "s", "reason": "x"})
        if attempts["n"] == 1:
            raise ConnectionError("boom")

    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"document.deleted": handler}, publisher)
    message = message_for("document.deleted", {"storageIds": ["s"], "userId": "u"})

    await consumer.handle_message(message)
    assert await count(pool, "outbox_events") == 0 and await count(pool, "processed_events") == 0
    assert message.acked and len(publisher.published) == 1  # went to the retry tier

    retry = publisher.published[0]
    from helpers import FakeMessage

    await consumer.handle_message(FakeMessage("document.deleted", retry["body"], retry["headers"], retry["message_id"]))
    assert attempts["n"] == 2
    assert await count(pool, "outbox_events") == 1 and await count(pool, "processed_events") == 1


async def test_outbox_rows_carry_the_v1_envelope(pool):
    async def handler(ctx: HandlerContext) -> None:
        await outbox.add(ctx.conn, "ai.generation.failed", {"jobId": "j1", "reason": "R"}, ctx.envelope.correlationId)

    consumer = EventConsumer(pool, {"content.generation.requested": handler}, FakePublisher())
    message = message_for("content.generation.requested", {"jobId": "j1"})
    await consumer.handle_message(message)

    row = await pool.fetchrow("SELECT source, type, envelope FROM outbox_events")
    envelope = json.loads(row["envelope"])
    assert (row["source"], row["type"]) == ("ai", "ai.generation.failed")
    assert envelope["version"] == 1 and envelope["source"] == "ai"
    assert envelope["correlationId"] == json.loads(message.body)["correlationId"]
    assert envelope["data"] == {"jobId": "j1", "reason": "R"}


async def test_handler_context_exposes_the_retry_budget(pool):
    seen = []

    async def handler(ctx: HandlerContext) -> None:
        seen.append((ctx.retry_count, ctx.is_last_attempt))

    consumer = EventConsumer(pool, {"document.uploaded": handler}, FakePublisher())
    await consumer.handle_message(message_for("document.uploaded", {}, headers={"x-retry-count": 5}))
    assert seen == [(5, True)]
