"""Consumer + relay against a real broker: delivery, retry tier, DLQ, confirmed relay."""

import asyncio
import json

import aio_pika
import pytest

from src.backend.messaging import envelope as env
from src.backend.messaging import outbox
from src.backend.messaging.consumer import EventConsumer, HandlerContext
from src.backend.messaging.errors import PermanentEventError
from src.backend.messaging.outbox_relay import OutboxRelay
from src.backend.messaging.publisher import AmqpPublisher
from src.backend.messaging.topology import EVENTS_EXCHANGE


async def until(predicate, timeout: float = 10.0):
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        result = await predicate()
        if result:
            return result
        await asyncio.sleep(0.05)
    raise AssertionError("condition not met in time")


@pytest.fixture
async def broker(rabbitmq_url):
    connection = await aio_pika.connect_robust(rabbitmq_url)
    channel = await connection.channel()
    for queue in ("ai.events", "ai.retry.30s", "ai.dlq", "probe"):
        await channel.queue_delete(queue)
    for exchange in ("ai.retry", "ai.requeue", "ai.dead"):
        await channel.exchange_delete(exchange)
    yield channel
    await connection.close()


async def publish_event(channel, type_, data, source=None):
    envelope = env.build(type_, data, env.domain_of(type_))
    if source:  # forge: the builder itself refuses a source that disagrees with the type
        envelope = type(envelope)(**{**envelope.to_dict(), "source": source})
    exchange = await channel.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
    await exchange.publish(
        aio_pika.Message(json.dumps(envelope.to_dict()).encode(), message_id=envelope.id, content_type="application/json"),
        routing_key=type_,
    )
    return envelope


async def depth(channel, name: str) -> int:
    # aio-pika caches declared queues (stale counts); ask the broker through the raw channel.
    underlay = await channel.get_underlay_channel()
    return (await underlay.queue_declare(name, passive=True)).message_count


async def test_event_is_delivered_handled_once_and_acked(pool, rabbitmq_url, broker):
    handled = []

    async def handler(ctx: HandlerContext) -> None:
        handled.append(ctx.envelope.data)
        await outbox.add(ctx.conn, "ai.document.processed", {"storageId": "s", "pageCount": 1})

    consumer = EventConsumer(pool, {"document.deleted": handler}, None)
    await consumer.start(rabbitmq_url)
    try:
        await publish_event(broker, "document.deleted", {"storageIds": ["s"], "userId": "u"})
        await until(lambda: pool.fetchval("SELECT count(*) = 1 FROM processed_events"))
    finally:
        await consumer.stop()
    assert handled == [{"storageIds": ["s"], "userId": "u"}] and await depth(broker, "ai.events") == 0


async def test_transient_failure_lands_in_the_30s_retry_queue(pool, rabbitmq_url, broker):
    async def handler(ctx: HandlerContext) -> None:
        raise ConnectionError("transient")

    consumer = EventConsumer(pool, {"document.deleted": handler}, None)
    await consumer.start(rabbitmq_url)
    try:
        await publish_event(broker, "document.deleted", {"storageIds": []})
        await until(lambda: _depth_is(broker, "ai.retry.30s", 1))
    finally:
        await consumer.stop()
    retry = await broker.declare_queue("ai.retry.30s", passive=True)
    message = await retry.get(timeout=5)
    assert message.headers["x-retry-count"] == 1 and message.routing_key == "document.deleted"
    assert await depth(broker, "ai.dlq") == 0


async def _depth_is(channel, name, expected):
    return await depth(channel, name) == expected


async def test_permanent_failure_is_dead_lettered_to_ai_dlq(pool, rabbitmq_url, broker):
    async def handler(ctx: HandlerContext) -> None:
        raise PermanentEventError("INVALID_PAYLOAD")

    consumer = EventConsumer(pool, {"document.deleted": handler}, None)
    await consumer.start(rabbitmq_url)
    try:
        await publish_event(broker, "document.deleted", {})
        await until(lambda: _depth_is(broker, "ai.dlq", 1))
    finally:
        await consumer.stop()


async def test_wrong_source_on_the_wire_is_dead_lettered_without_effect(pool, rabbitmq_url, broker):
    handled = []

    async def handler(ctx: HandlerContext) -> None:
        handled.append(1)

    consumer = EventConsumer(pool, {"document.uploaded": handler}, None)
    await consumer.start(rabbitmq_url)
    try:
        await publish_event(broker, "document.uploaded", {}, source="content")
        await until(lambda: _depth_is(broker, "ai.dlq", 1))
    finally:
        await consumer.stop()
    assert handled == []


async def test_relay_publishes_with_confirms_to_the_events_exchange(pool, rabbitmq_url, broker):
    exchange = await broker.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
    probe = await broker.declare_queue("probe", durable=False)
    await probe.bind(exchange, routing_key="ai.#")
    async with pool.acquire() as conn:
        sent = await outbox.add(conn, "ai.generation.completed", {"jobId": "j", "type": "quiz", "items": {}})

    connection = await aio_pika.connect_robust(rabbitmq_url)
    try:
        relay = OutboxRelay(pool, AmqpPublisher(await connection.channel()))
        assert await relay.tick() == 1
    finally:
        await connection.close()

    message = await probe.get(timeout=5)
    body = json.loads(message.body)
    assert body["id"] == sent.id and message.message_id == sent.id and message.routing_key == "ai.generation.completed"
    assert message.delivery_mode == aio_pika.DeliveryMode.PERSISTENT
    assert await pool.fetchval("SELECT published_at IS NOT NULL FROM outbox_events") is True
