"""generate_content_with_model: optional per-call max_tokens and strict truncation; defaults unchanged."""

from __future__ import annotations

import os
from unittest import mock

import httpx
import pytest

from src.llm.model_manager import (
    ModelUnavailableError,
    OutputTruncatedError,
    model_manager,
)


def _completion(content: str, finish_reason: str) -> httpx.Response:
    body = {'choices': [{'message': {'content': content}, 'finish_reason': finish_reason}], 'usage': {}}
    return httpx.Response(200, json=body, request=httpx.Request('POST', 'https://ai2.test/v1/chat/completions'))


def _client(response: httpx.Response) -> mock.Mock:
    client = mock.Mock()
    client.post = mock.AsyncMock(return_value=response)
    return client


async def _run(client: mock.Mock, **kwargs) -> str:
    with mock.patch.dict(os.environ, {'AI2_API_KEY': 'test-key'}), \
            mock.patch.object(model_manager, '_get_ai2_client', return_value=client):
        return await model_manager._generate_with_ai2('prompt', None, **kwargs)


async def test_default_max_tokens_comes_from_the_environment_settings():
    client = _client(_completion('ok', 'stop'))
    with mock.patch.dict(os.environ, {'AI2_MAX_TOKENS': '1234'}):
        await _run(client)
    assert client.post.await_args.kwargs['json']['max_tokens'] == 1234


async def test_explicit_max_tokens_overrides_the_default_and_is_bounded():
    client = _client(_completion('ok', 'stop'))
    await _run(client, max_tokens=2048)
    assert client.post.await_args.kwargs['json']['max_tokens'] == 2048
    await _run(client, max_tokens=10**9)
    assert client.post.await_args.kwargs['json']['max_tokens'] == 32768


async def test_truncation_is_returned_by_default_but_raises_when_asked():
    cut = _completion('{"entities": [{"na', 'length')
    assert await _run(_client(cut)) == '{"entities": [{"na'  # legacy behaviour: caller gets the cut text
    with pytest.raises(OutputTruncatedError) as err:
        await _run(_client(cut), raise_on_truncation=True)
    assert isinstance(err.value, ModelUnavailableError) and err.value.code == 'OUTPUT_TRUNCATED'


async def test_a_normal_stop_never_raises_in_strict_mode():
    assert await _run(_client(_completion('{}', 'stop')), raise_on_truncation=True) == '{}'


async def test_generate_content_with_model_forwards_the_new_options():
    forwarded = {}

    async def fake_ai2(prompt, model_id, system_prompt=None, max_tokens=None, raise_on_truncation=False):
        forwarded.update(max_tokens=max_tokens, raise_on_truncation=raise_on_truncation)
        return 'x'

    with mock.patch.object(model_manager, 'ensure_generation_model_ready', mock.AsyncMock()), \
            mock.patch.object(model_manager, '_generate_with_ai2', fake_ai2), \
            mock.patch.object(model_manager, 'resolve_model', return_value=mock.Mock(provider='ai2', id='m')):
        assert await model_manager.generate_content_with_model('p', None, max_tokens=99, raise_on_truncation=True) == 'x'
    assert forwarded == {'max_tokens': 99, 'raise_on_truncation': True}


def test_ai2_max_tokens_default_leaves_room_for_reasoning_models() -> None:
    env = {k: v for k, v in os.environ.items() if k not in ('AI2_MAX_TOKENS', 'DEFAULT_MAX_TOKENS_CAP')}
    with mock.patch.dict(os.environ, env, clear=True):
        assert model_manager.get_ai2_max_tokens() == 8192
