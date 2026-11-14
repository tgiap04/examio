"""AI2 router model ids: prefixed display names and fallback for ids of the retired router."""

from __future__ import annotations

import importlib
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.llm import model_registry  # noqa: E402

_ENV = {
    'AI2_GENERATION_MODEL_NAMES': 'oc/minimax-m3.1-flash-free,oc/deepseek-v4.1-flash-free',
    'AI2_DEFAULT_MODEL': 'oc/minimax-m3.1-flash-free',
}


class Ai2RouterModelTest(unittest.TestCase):
    def setUp(self) -> None:
        with mock.patch.dict(os.environ, _ENV):
            self.registry = importlib.reload(model_registry)

    def tearDown(self) -> None:
        importlib.reload(model_registry)

    def test_display_name_drops_router_prefix(self) -> None:
        self.assertEqual(self.registry._format_ai2_display_name('oc/minimax-m3.1-flash-free'), 'Minimax M3 1 Flash Free')
        self.assertEqual(self.registry._format_ai2_display_name('Faye-AI'), 'Faye Ai')

    def test_prefixed_id_resolves_to_itself(self) -> None:
        entry = self.registry.resolve_generation_model('oc/deepseek-v4.1-flash-free')
        self.assertEqual(entry.runtime_model_name, 'oc/deepseek-v4.1-flash-free')

    def test_retired_router_ids_fall_back_to_default(self) -> None:
        for old_id in ('minimax-m2.5-free', 'nemotron-3-super-free', 'trinity-large-preview-free'):
            self.assertEqual(self.registry.resolve_generation_model(old_id).id, 'oc/minimax-m3.1-flash-free')

    def test_unknown_id_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.registry.resolve_generation_model('oc/not-a-model')



class DefaultAi2ModelTest(unittest.TestCase):
    """Without AI2_* env the router's Faye-AI model is the only and default generation model."""

    def setUp(self) -> None:
        env = {k: v for k, v in os.environ.items() if k not in ('AI2_GENERATION_MODEL_NAMES', 'AI2_DEFAULT_MODEL')}
        with mock.patch.dict(os.environ, env, clear=True):
            self.registry = importlib.reload(model_registry)

    def tearDown(self) -> None:
        importlib.reload(model_registry)

    def test_faye_ai_is_the_default_generation_model(self) -> None:
        self.assertEqual(self.registry.DEFAULT_AI2_GENERATION_MODEL_NAMES, ('Faye-AI',))
        self.assertEqual(self.registry.get_default_generation_model().runtime_model_name, 'Faye-AI')

    def test_ids_of_the_previous_defaults_fall_back_to_faye_ai(self) -> None:
        for old_id in ('oc/deepseek-v4.1-flash-free', 'oc/nemotron-3.5-lightning-free', 'oc/minimax-m3.1-flash-free'):
            self.assertEqual(self.registry.resolve_generation_model(old_id).runtime_model_name, 'Faye-AI')


if __name__ == '__main__':
    unittest.main()
