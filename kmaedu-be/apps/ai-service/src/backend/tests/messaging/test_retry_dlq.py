"""Transient errors go to the 30 s retry tier; the budget is spent -> DLQ."""

from helpers import FakeMessage, FakePublisher, message_for

from src.backend.messaging.consumer import EventConsumer, HandlerContext
from src.backend.messaging.errors import PermanentEventError
from src.backend.messaging.topology import MAX_RETRIES, topology_names


def failing(exc: Exception):
    async def handler(ctx: HandlerContext) -> None:
        raise exc

    return handler


async def test_transient_error_is_republished_to_ai_retry_with_an_incremented_count(pool):
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"document.uploaded": failing(ConnectionError("db"))}, publisher)
    message = message_for("document.uploaded", {"storageId": "s"})

    await consumer.handle_message(message)

    assert message.acked and not message.nacked
    (retry,) = publisher.published
    assert retry["exchange"] == topology_names("ai").retry_exchange == "ai.retry"
    assert retry["routing_key"] == "document.uploaded"
    assert retry["headers"] == {"x-retry-count": 1}
    assert retry["body"] == message.body and retry["message_id"] == message.message_id


async def test_retry_count_keeps_climbing_until_the_budget(pool):
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"document.uploaded": failing(ConnectionError("db"))}, publisher)
    message = message_for("document.uploaded", {}, headers={"x-retry-count": MAX_RETRIES - 1})
    await consumer.handle_message(message)
    assert publisher.published[0]["headers"] == {"x-retry-count": MAX_RETRIES}
    assert message.acked


async def test_exhausted_retries_nack_without_requeue_so_the_broker_dead_letters(pool):
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"document.uploaded": failing(ConnectionError("db"))}, publisher)
    message = message_for("document.uploaded", {}, headers={"x-retry-count": MAX_RETRIES})
    await consumer.handle_message(message)
    assert message.nacked and message.requeued is False and not message.acked
    assert publisher.published == []  # -> ai.dead -> ai.dlq via the queue's DLX


async def test_permanent_error_goes_straight_to_the_dlq(pool):
    publisher = FakePublisher()
    consumer = EventConsumer(pool, {"document.uploaded": failing(PermanentEventError("INVALID_PAYLOAD"))}, publisher)
    message = message_for("document.uploaded", {})
    await consumer.handle_message(message)
    assert message.nacked and message.requeued is False
    assert publisher.published == []


async def test_unhandled_routing_key_is_dead_lettered(pool):
    consumer = EventConsumer(pool, {}, FakePublisher())
    message = message_for("document.uploaded", {})
    await consumer.handle_message(message)
    assert message.nacked and message.requeued is False


async def test_failed_retry_publish_returns_the_original_to_the_queue(pool):
    publisher = FakePublisher(fail=True)
    consumer = EventConsumer(pool, {"document.uploaded": failing(ConnectionError("db"))}, publisher)
    message = message_for("document.uploaded", {})
    await consumer.handle_message(message)
    assert message.nacked and message.requeued is True and not message.acked


async def test_garbage_body_is_dead_lettered(pool):
    consumer = EventConsumer(pool, {"document.uploaded": failing(ConnectionError("x"))}, FakePublisher())
    message = FakeMessage("document.uploaded", b"{not json", {}, None)
    await consumer.handle_message(message)
    assert message.nacked and message.requeued is False
