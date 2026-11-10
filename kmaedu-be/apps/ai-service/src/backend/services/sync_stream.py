"""Bridge a blocking generator (the LLM token stream) into an async iterator.

The generator runs in a worker thread, so a slow model never blocks the event
loop that serves the other gRPC streams. When the consumer stops early (client
cancel, error) the thread is told to stop after the in-flight chunk and the
generator is closed, which aborts the upstream LLM stream.
"""

from __future__ import annotations

import asyncio
import threading
from collections.abc import AsyncIterator, Callable, Iterator

_DONE = object()


class _Failure:
    def __init__(self, error: BaseException) -> None:
        self.error = error


async def aiter_blocking[T](factory: Callable[[], Iterator[T]], max_buffer: int = 64) -> AsyncIterator[T]:
    """Yield the items of ``factory()`` without blocking the event loop.

    ``factory`` is called inside the worker thread, so constructing the stream
    (which may do network I/O) is off-loop too. Exceptions raised by the
    generator re-raise in the consumer; closing/cancelling the consumer stops
    the thread and closes the generator.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[object] = asyncio.Queue(maxsize=max_buffer)
    stop = threading.Event()

    def put(item: object) -> None:
        # Block the worker (not the loop) while the consumer is slow; give up on stop.
        future = asyncio.run_coroutine_threadsafe(queue.put(item), loop)
        while not stop.is_set():
            try:
                future.result(timeout=0.2)
                return
            except TimeoutError:
                continue
            except Exception:
                return
        future.cancel()

    def worker() -> None:
        generator: Iterator[T] | None = None
        try:
            generator = factory()
            for item in generator:
                if stop.is_set():
                    break
                put(item)
            put(_DONE)
        except BaseException as exc:  # forwarded to the consumer
            put(_Failure(exc))
        finally:
            close = getattr(generator, "close", None)
            if close is not None:
                try:
                    close()
                except Exception:  # closing must never mask the real outcome
                    pass

    thread = threading.Thread(target=worker, name="llm-stream", daemon=True)
    thread.start()
    try:
        while True:
            item = await queue.get()
            if item is _DONE:
                return
            if isinstance(item, _Failure):
                raise item.error
            yield item  # type: ignore[misc]
    finally:
        stop.set()
