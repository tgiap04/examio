"""Worker liveness file: refreshed while healthy, left to go stale when not."""

import asyncio
import os

from src.backend.messaging.heartbeat import (
    clear_heartbeat,
    heartbeat_path,
    run_heartbeat,
)


async def _run_for(seconds: float, healthy, path, interval: float = 0.01) -> None:
    stop = asyncio.Event()
    task = asyncio.create_task(run_heartbeat(stop, healthy, path, interval))
    await asyncio.sleep(seconds)
    stop.set()
    await asyncio.wait_for(task, 1)


async def test_touches_the_file_while_healthy(tmp_path):
    beat = tmp_path / "hb"
    await _run_for(0.05, lambda: True, beat)
    assert beat.exists()


async def test_unhealthy_worker_never_touches_and_stops_refreshing(tmp_path):
    beat = tmp_path / "hb"
    await _run_for(0.05, lambda: False, beat)
    assert not beat.exists()

    beat.touch()
    stale = beat.stat().st_mtime - 600
    os.utime(beat, (stale, stale))
    await _run_for(0.05, lambda: False, beat)
    assert (
        beat.stat().st_mtime == stale
    )  # an unhealthy worker leaves the old mtime for the healthcheck


async def test_unwritable_path_does_not_kill_the_loop(tmp_path):
    await _run_for(
        0.05, lambda: True, tmp_path / "missing-dir" / "hb"
    )  # touch raises OSError; loop survives


def test_path_defaults_to_tmp_and_honours_the_env(monkeypatch, tmp_path):
    monkeypatch.delenv("WORKER_HEARTBEAT_FILE", raising=False)
    assert str(heartbeat_path()) == "/tmp/worker-heartbeat"
    monkeypatch.setenv("WORKER_HEARTBEAT_FILE", str(tmp_path / "x"))
    assert heartbeat_path() == tmp_path / "x"


class _RobustConnection:
    """A robust connection mid-retry: not closed, but not connected either."""

    def __init__(self, connected: bool) -> None:
        self.is_closed = False
        self.connected = asyncio.Event()
        if connected:
            self.connected.set()


def test_consumer_is_not_connected_while_the_robust_connection_retries():
    from src.backend.messaging.consumer import EventConsumer

    consumer = EventConsumer(None, {}, None)
    assert not consumer.is_connected
    consumer._connection = _RobustConnection(connected=True)
    assert consumer.is_connected
    consumer._connection = _RobustConnection(connected=False)
    assert not consumer.is_connected


def test_clear_drops_a_heartbeat_left_by_a_previous_run(tmp_path):
    beat = tmp_path / "hb"
    beat.touch()
    clear_heartbeat(beat)
    assert not beat.exists()
    clear_heartbeat(beat)  # nothing to drop: no error
