"""AI2 completions cut by max_tokens (often reasoning tokens) or returned empty must be logged, not passed on silently."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.llm.model_manager import model_manager  # noqa: E402


def _completion(content: str, finish_reason: str) -> httpx.Response:
    body = {
        'choices': [{'message': {'content': content}, 'finish_reason': finish_reason}],
        'usage': {'completion_tokens': 4096, 'completion_tokens_details': {'reasoning_tokens': 2704}},
    }
    return httpx.Response(200, json=body, request=httpx.Request('POST', 'https://ai2.test/v1/chat/completions'))


class Ai2TruncatedOutputWarningTest(unittest.TestCase):
    def _run(self, response: httpx.Response) -> tuple[str, list[str]]:
        client = mock.Mock()
        client.post = mock.AsyncMock(return_value=response)
        with mock.patch.dict(os.environ, {'AI2_API_KEY': 'test-key'}), \
                mock.patch.object(model_manager, '_get_ai2_client', return_value=client), \
                self.assertLogs('src.llm.model_manager', level='WARNING') as logs:
            content = asyncio.run(model_manager._generate_with_ai2('prompt', None))
        return content, logs.output

    def test_length_finish_is_logged_with_reasoning_tokens(self) -> None:
        content, logs = self._run(_completion('[{"question": "Tron', 'length'))
        self.assertEqual(content, '[{"question": "Tron')
        self.assertTrue(any('finish_reason=length' in line and 'reasoning_tokens=2704' in line for line in logs), logs)

    def test_empty_content_is_logged(self) -> None:
        content, logs = self._run(_completion('', 'tool_calls'))
        self.assertEqual(content, '')
        self.assertTrue(any('finish_reason=tool_calls' in line for line in logs), logs)

    def test_normal_stop_logs_nothing(self) -> None:
        client = mock.Mock()
        client.post = mock.AsyncMock(return_value=_completion('[]', 'stop'))
        with mock.patch.dict(os.environ, {'AI2_API_KEY': 'test-key'}), \
                mock.patch.object(model_manager, '_get_ai2_client', return_value=client), \
                self.assertNoLogs('src.llm.model_manager', level='WARNING'):
            self.assertEqual(asyncio.run(model_manager._generate_with_ai2('prompt', None)), '[]')


if __name__ == '__main__':
    unittest.main()
