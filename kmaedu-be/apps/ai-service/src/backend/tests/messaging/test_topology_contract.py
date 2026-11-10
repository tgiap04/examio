"""Python and libs/messaging declare the same ``ai.*`` topology: no PRECONDITION_FAILED."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import aio_pika
import pytest

from src.backend.messaging.topology import (
    EVENTS_EXCHANGE,
    MAX_RETRIES,
    RETRY_DELAY_MS,
    declare_topology,
    topology_names,
)

BE_ROOT = Path(__file__).resolve().parents[6]
TOPOLOGY_TS = BE_ROOT / "libs/messaging/src/topology.ts"
SCRIPT = Path(__file__).with_name("ts_declare_topology.cjs")
NAMES = topology_names("ai")


def ts_constant(name: str):
    match = re.search(rf"export const {name} = ([\d_]+|'[^']+');", TOPOLOGY_TS.read_text())
    assert match, name
    raw = match.group(1)
    return raw.strip("'") if raw.startswith("'") else int(raw.replace("_", ""))


def declare_with_nest(url: str) -> dict:
    if not shutil.which("node") or not (BE_ROOT / "node_modules/ts-node").exists():
        pytest.skip("node + ts-node (yarn install in kmaedu-be) needed to run libs/messaging")
    result = subprocess.run(
        ["node", str(SCRIPT), str(BE_ROOT), url], cwd=BE_ROOT, capture_output=True, text=True, timeout=90
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


async def wipe(url: str) -> None:
    connection = await aio_pika.connect(url)
    async with connection:
        channel = await connection.channel()
        for queue in (NAMES.events, NAMES.retry_queue, NAMES.dlq):
            await channel.queue_delete(queue)
        for exchange in (NAMES.retry_exchange, NAMES.requeue_exchange, NAMES.dead_exchange):
            await channel.exchange_delete(exchange)


async def declare_with_python(url: str) -> None:
    connection = await aio_pika.connect(url)
    async with connection:
        await declare_topology(await connection.channel(), "ai")


def test_constants_match_libs_messaging():
    assert ts_constant("EVENTS_EXCHANGE") == EVENTS_EXCHANGE
    assert ts_constant("RETRY_DELAY_MS") == RETRY_DELAY_MS == 30_000
    assert ts_constant("MAX_RETRIES") == MAX_RETRIES == 5


async def test_python_then_nest_declare_without_precondition_failed(rabbitmq_url):
    await wipe(rabbitmq_url)
    await declare_with_python(rabbitmq_url)
    names = declare_with_nest(rabbitmq_url)  # would exit 1 on PRECONDITION_FAILED
    assert names == {
        "events": NAMES.events, "retryExchange": NAMES.retry_exchange, "retryQueue": NAMES.retry_queue,
        "requeueExchange": NAMES.requeue_exchange, "deadExchange": NAMES.dead_exchange, "dlq": NAMES.dlq,
    }


async def test_nest_then_python_declare_without_precondition_failed(rabbitmq_url):
    await wipe(rabbitmq_url)
    declare_with_nest(rabbitmq_url)
    await declare_with_python(rabbitmq_url)  # aio-pika raises ChannelPreconditionFailed on a mismatch
    await declare_with_python(rabbitmq_url)  # and it is idempotent
