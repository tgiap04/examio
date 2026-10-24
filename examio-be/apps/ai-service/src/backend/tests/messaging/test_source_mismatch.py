"""An envelope that disagrees with its routing key never reaches a handler."""

import pytest
from helpers import FakePublisher, message_for, raw_message

from src.backend.messaging import envelope as env
from src.backend.messaging.consumer import EventConsumer


def build(handlers):
    called = []

    async def handler(ctx):
        called.append(ctx.envelope.id)

    # The pool is never reached: validation fails first.
    return EventConsumer(None, {key: handler for key in handlers}, FakePublisher()), called


def forged(type_: str, source: str, routing_key: str | None = None):
    d = env.build(type_, {}, env.domain_of(type_)).to_dict()
    d["source"] = source
    return raw_message(routing_key or type_, d)


@pytest.mark.parametrize(
    ("type_", "source"),
    [
        ("document.uploaded", "content"),
        ("document.deleted", "exam"),
        ("content.generation.requested", "document"),
        ("content.generation.requested", "ai"),
    ],
)
async def test_wrong_source_goes_to_the_dlq_without_effect(type_, source):
    consumer, called = build([type_])
    message = forged(type_, source)
    await consumer.handle_message(message)
    assert message.nacked and message.requeued is False and not message.acked
    assert called == []


async def test_type_that_differs_from_the_routing_key_is_rejected():
    consumer, called = build(["document.uploaded"])
    message = forged("document.deleted", "document", routing_key="document.uploaded")
    await consumer.handle_message(message)
    assert message.nacked and message.requeued is False and called == []


@pytest.mark.parametrize("source", ["content", "exam"])
async def test_content_events_may_come_from_content_or_exam(source, pool):
    consumer, called = build(["content.generation.requested"])
    consumer._pool = pool
    message = forged("content.generation.requested", source)
    await consumer.handle_message(message)
    assert message.acked and len(called) == 1


async def test_document_events_must_come_from_document(pool):
    consumer, called = build(["document.uploaded"])
    consumer._pool = pool
    ok = message_for("document.uploaded", {})
    await consumer.handle_message(ok)
    assert ok.acked and len(called) == 1
