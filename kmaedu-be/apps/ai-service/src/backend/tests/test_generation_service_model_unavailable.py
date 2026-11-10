"""Word-family generation must surface ModelUnavailableError as a 503 payload."""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.backend.services import generation_service as generation_module  # noqa: E402
from src.backend.services.generation_service import (  # noqa: E402
    ContentGenerationService,
    WordFamilyRequest,
)
from src.llm.model_manager import ModelUnavailableError  # noqa: E402


def _request() -> WordFamilyRequest:
    return WordFamilyRequest(category_slug="travel", category_name="Travel")


class WordFamilyModelUnavailableTest(unittest.TestCase):
    def setUp(self) -> None:
        self.service = ContentGenerationService()

    def test_model_unavailable_returns_503_payload(self) -> None:
        error = ModelUnavailableError("model offline", code="MODEL_DOWN")
        fake_manager = mock.Mock()
        fake_manager.resolve_model.return_value = SimpleNamespace(id="m1")
        fake_manager.generate_content_with_model = mock.AsyncMock(side_effect=error)

        with mock.patch.object(generation_module, "model_manager", fake_manager):
            result = asyncio.run(self.service.generate_word_family(_request()))

        self.assertEqual(
            result,
            {
                "success": False,
                "error": "model offline",
                "error_code": "MODEL_DOWN",
                "status_code": 503,
            },
        )
        # Not retried: the inner handler re-raises instead of looping.
        self.assertEqual(fake_manager.generate_content_with_model.await_count, 1)

    def test_other_errors_keep_generic_failure_shape(self) -> None:
        fake_manager = mock.Mock()
        fake_manager.resolve_model.return_value = SimpleNamespace(id="m1")
        fake_manager.generate_content_with_model = mock.AsyncMock(
            side_effect=RuntimeError("boom")
        )

        with mock.patch.object(generation_module, "model_manager", fake_manager):
            result = asyncio.run(self.service.generate_word_family(_request()))

        self.assertEqual(result, {"success": False, "error": "boom"})


if __name__ == "__main__":
    unittest.main()
