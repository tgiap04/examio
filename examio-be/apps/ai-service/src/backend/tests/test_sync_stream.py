"""The blocking-generator bridge: no loop blocking, errors forwarded, cancel closes."""

import asyncio
import threading
import time

import pytest

from src.backend.services.sync_stream import aiter_blocking


async def test_items_flow_in_order_without_blocking_the_loop():
    def tokens():
        for i in range(3):
            time.sleep(0.05)
            yield i

    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(ticker())
    assert [i async for i in aiter_blocking(tokens)] == [0, 1, 2]
    task.cancel()
    assert ticks >= 5  # the loop kept running while the generator slept


async def test_generator_errors_surface_in_the_consumer():
    def tokens():
        yield "a"
        raise RuntimeError("llm exploded")

    seen = []
    with pytest.raises(RuntimeError, match="llm exploded"):
        async for item in aiter_blocking(tokens):
            seen.append(item)
    assert seen == ["a"]


async def test_early_exit_closes_the_generator():
    closed = threading.Event()

    def tokens():
        try:
            for i in range(10_000):
                time.sleep(0.005)
                yield i
        finally:
            closed.set()

    stream = aiter_blocking(tokens)
    assert await stream.__anext__() == 0
    await stream.aclose()
    assert await asyncio.to_thread(closed.wait, 2)


async def test_cancelled_consumer_closes_the_generator():
    closed = threading.Event()

    def tokens():
        try:
            while True:
                time.sleep(0.005)
                yield 1
        finally:
            closed.set()

    async def consume():
        async for _ in aiter_blocking(tokens):
            pass

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert await asyncio.to_thread(closed.wait, 2)
