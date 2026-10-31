"""
Model Manager Module de quan ly da model generation/chat va embedding.
"""

import asyncio
import logging
import os
import time
from enum import Enum
from typing import Any, Dict, Optional

import httpx

from dotenv import load_dotenv

from src.llm.model_registry import (
    get_default_generation_model,
    get_embedding_model,
    get_frontend_model_catalog,
    get_generation_models,
    resolve_generation_model,
)

load_dotenv()

logger = logging.getLogger(__name__)

# TTL cache for AI2 model names — avoids hitting the provider on every request
_AI2_MODELS_CACHE_TTL_SECONDS = 300  # 5 minutes
_ai2_models_cache: dict[str, tuple[float, set[str]]] = {}  # url -> (timestamp, model_names)


def _get_cached_ai2_models(url: str) -> tuple[bool, set[str]]:
    """Return (cache_hit, model_names_set)."""
    entry = _ai2_models_cache.get(url)
    if entry is None:
        return False, set()
    timestamp, names = entry
    if time.monotonic() - timestamp > _AI2_MODELS_CACHE_TTL_SECONDS:
        del _ai2_models_cache[url]
        return False, set()
    return True, names


def _set_cached_ai2_models(url: str, names: set[str]) -> None:
    _ai2_models_cache[url] = (time.monotonic(), names)


class ModelType(str, Enum):
    GEMINI = 'gemini'
    AI2 = 'ai2'


class ModelUnavailableError(Exception):
    def __init__(self, message: str, code: str = 'MODEL_UNAVAILABLE') -> None:
        super().__init__(message)
        self.code = code


class ModelManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._runtime_model_id: Optional[str] = None
        self._runtime_model_type: Optional[ModelType] = None
        self._runtime_gemini_model: Optional[str] = None
        # Shared AI2 HTTP client: reused across every generation/model-list call
        # so each LLM batch does not pay a fresh TCP + TLS handshake.
        self._ai2_client: Optional[httpx.AsyncClient] = None
        self._initialized = True

    def _get_ai2_client(self) -> httpx.AsyncClient:
        """Return the shared AI2 httpx client, creating it lazily.

        Per-request timeouts are passed at call sites; the pooled client keeps
        connections alive (keep-alive) between batches.
        """
        if self._ai2_client is None or self._ai2_client.is_closed:
            self._ai2_client = httpx.AsyncClient(
                trust_env=False,
                limits=httpx.Limits(
                    max_connections=20, max_keepalive_connections=20
                ),
            )
        return self._ai2_client

    async def aclose(self) -> None:
        """Close the shared AI2 client. Call on app shutdown."""
        if self._ai2_client is not None and not self._ai2_client.is_closed:
            await self._ai2_client.aclose()
            self._ai2_client = None

    def get_model_parameter(self, param_name: str, default_value: Any = None) -> Any:
        env_map = {
            'temperature': 'DEFAULT_TEMPERATURE',
            'max_tokens': 'DEFAULT_MAX_TOKENS',
        }
        env_key = env_map.get(param_name)
        if env_key:
            val = os.getenv(env_key)
            if val:
                try:
                    if param_name == 'temperature':
                        return float(val)
                    if param_name == 'max_tokens':
                        return int(val)
                except Exception:
                    pass
        return default_value

    def get_temperature(self) -> float:
        val = self.get_model_parameter('temperature', 0.7)
        return float(val) if val is not None else 0.7

    def get_max_tokens(self) -> int:
        val = self.get_model_parameter('max_tokens', 4096)
        max_tokens = int(val) if val is not None else 4096
        return min(max_tokens, self.get_max_tokens_cap())

    def get_max_tokens_cap(self) -> int:
        raw_value = os.getenv('DEFAULT_MAX_TOKENS_CAP')
        if raw_value is None:
            return 4096
        try:
            return max(1, int(raw_value))
        except ValueError:
            logger.warning('Invalid DEFAULT_MAX_TOKENS_CAP=%s, using default=4096', raw_value)
            return 4096

    def get_ai2_max_tokens(self) -> int:
        raw_value = os.getenv('AI2_MAX_TOKENS')
        if raw_value is None:
            return min(self.get_max_tokens(), 4096)
        try:
            return max(1, min(int(raw_value), 32768))
        except ValueError:
            logger.warning('Invalid AI2_MAX_TOKENS=%s, using default=4096', raw_value)
            return 4096

    def get_default_model_id(self) -> str:
        env_model = os.getenv('DEFAULT_MODEL_ID') or os.getenv('AI2_DEFAULT_MODEL')
        if env_model:
            try:
                return resolve_generation_model(env_model).id
            except ValueError:
                logger.warning('Invalid default generation model=%s, using registry default', env_model)
        return get_default_generation_model().id

    def resolve_model(self, model_id: str | None = None):
        runtime_model_id = model_id or self._runtime_model_id or self.get_default_model_id()
        return resolve_generation_model(runtime_model_id)

    def get_model_type(self) -> ModelType:
        if self._runtime_model_type is not None:
            return self._runtime_model_type
        model = self.resolve_model()
        return ModelType(model.provider)

    def get_current_model_id(self) -> str:
        return self.resolve_model().id

    def get_gemini_info(self, model_id: str | None = None) -> Dict[str, Any]:
        model = self.resolve_model(model_id)
        return {
            'model': self._runtime_gemini_model or os.getenv('GEMINI_MODEL', 'gemini-2.5-flash'),
            'id': model.id,
            'runtime_model_name': model.runtime_model_name,
        }

    def get_ai2_base_url(self) -> str:
        raw_base_url = os.getenv('AI2_BASE_URL', 'https://ai.fayedark.com/v1').strip().rstrip('/')
        return raw_base_url if raw_base_url.endswith('/v1') else f'{raw_base_url}/v1'

    def get_ai2_timeout(self) -> float:
        raw_timeout = os.getenv('AI2_TIMEOUT_SECONDS')
        if raw_timeout is None:
            return 3600.0
        try:
            return max(1.0, float(raw_timeout))
        except ValueError:
            logger.warning('Invalid AI2_TIMEOUT_SECONDS=%s, using default=3600', raw_timeout)
            return 3600.0

    def get_ai2_info(self, model_id: str | None = None) -> Dict[str, Any]:
        model = self.resolve_model(model_id)
        return {
            'model': model.runtime_model_name,
            'url': self.get_ai2_base_url(),
            'id': model.id,
            'api_key_configured': bool(os.getenv('AI2_API_KEY')),
            'timeout': self.get_ai2_timeout(),
        }

    def get_embedding_info(self) -> Dict[str, Any]:
        model = get_embedding_model()
        return {
            'id': model.id,
            'model': model.runtime_model_name,
        }

    async def check_generation_model_availability(
        self,
        model_id: str,
        installed_names: set[str] | None = None,
        availability_error: Exception | None = None,
        ai2_model_names: set[str] | None = None,
        ai2_availability_error: Exception | None = None,
    ) -> Dict[str, Any]:
        model = self.resolve_model(model_id)

        if model.provider == 'gemini':
            return {
                'modelId': model.id,
                'available': True,
                'reason': None,
            }

        if model.provider == 'ai2':
            api_key = os.getenv('AI2_API_KEY')
            if not api_key:
                return {
                    'modelId': model.id,
                    'available': False,
                    'reason': 'AI2_API_KEY chua duoc cau hinh cho tac vu sinh content.',
                    'code': 'MODEL_CONFIGURATION_ERROR',
                }
            if ai2_availability_error is not None:
                normalized_error = self._normalize_model_error(ai2_availability_error)
                return {
                    'modelId': model.id,
                    'available': False,
                    'reason': str(normalized_error),
                    'code': normalized_error.code,
                }
            if ai2_model_names is None:
                ai2_model_names = await self._fetch_ai2_model_names()
            if model.runtime_model_name not in ai2_model_names:
                return {
                    'modelId': model.id,
                    'available': False,
                    'reason': 'Model khong ton tai tren AI2 provider.',
                    'code': 'MODEL_UNAVAILABLE',
                }
            return {
                'modelId': model.id,
                'available': True,
                'reason': None,
            }

        return {
            'modelId': model.id,
            'available': True,
            'reason': None,
        }

    async def _fetch_ai2_model_names(self) -> set[str]:
        api_key = os.getenv('AI2_API_KEY')
        if not api_key:
            raise ModelUnavailableError(
                'AI2_API_KEY chua duoc cau hinh cho tac vu sinh content.',
                code='MODEL_CONFIGURATION_ERROR',
            )

        url = f'{self.get_ai2_base_url()}/models'
        hit, cached = _get_cached_ai2_models(url)
        if hit:
            return cached

        client = self._get_ai2_client()
        response = await client.get(
            url,
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=10.0,
        )
        self._raise_ai2_status_error(response)
        data = response.json()
        models = data.get('data', [])
        names = {
            item.get('id')
            for item in models
            if isinstance(item, dict) and item.get('id')
        }
        _set_cached_ai2_models(url, names)
        return names

    async def ensure_generation_model_ready(self, model_id: str) -> None:
        availability = await self.check_generation_model_availability(model_id)
        if not availability.get('available'):
            raise ModelUnavailableError(
                availability.get('reason') or 'Model is unavailable',
                code=availability.get('code', 'MODEL_UNAVAILABLE'),
            )

    async def get_frontend_model_catalog(self) -> Dict[str, Any]:
        availability_map: Dict[str, Dict[str, Any]] = {}
        generation_models = get_generation_models()
        ai2_model_ids = [model.id for model in generation_models if model.provider == 'ai2']

        ai2_model_names: set[str] | None = None
        ai2_availability_error: Exception | None = None
        if ai2_model_ids and os.getenv('AI2_API_KEY'):
            try:
                ai2_model_names = await self._fetch_ai2_model_names()
            except Exception as error:
                ai2_availability_error = error

        for model in generation_models:
            availability_map[model.id] = await self.check_generation_model_availability(
                model.id,
                ai2_model_names=ai2_model_names if model.provider == 'ai2' else None,
                ai2_availability_error=ai2_availability_error if model.provider == 'ai2' else None,
            )

        return get_frontend_model_catalog(availability=availability_map)

    def set_active_model_type(self, model_type: ModelType) -> None:
        self._runtime_model_type = model_type

    def set_active_model_id(self, model_id: str) -> None:
        model = resolve_generation_model(model_id)
        self._runtime_model_id = model.id
        self._runtime_model_type = ModelType(model.provider)
        if model.provider == 'gemini':
            self._runtime_gemini_model = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')

    def set_gemini_model(self, gemini_model: str) -> None:
        self._runtime_gemini_model = gemini_model
        self.set_active_model_type(ModelType.GEMINI)

    async def generate_content(self, prompt: str) -> str:
        return await self.generate_content_with_model(prompt, self.get_current_model_id())

    def _normalize_model_error(self, error: Exception) -> ModelUnavailableError:
        if isinstance(error, ModelUnavailableError):
            return error

        message = str(error)
        lower_message = message.lower()

        if 'ai2_api_key' in lower_message or 'api key' in lower_message or 'unauthorized' in lower_message or '401' in lower_message or '403' in lower_message:
            return ModelUnavailableError(message, code='MODEL_CONFIGURATION_ERROR')
        if 'vram' in lower_message or 'memory' in lower_message or 'insufficient' in lower_message:
            return ModelUnavailableError(message, code='MODEL_INSUFFICIENT_VRAM')
        if 'not found' in lower_message or '404' in lower_message or 'pull' in lower_message:
            return ModelUnavailableError(message, code='MODEL_UNAVAILABLE')
        if 'connect' in lower_message or 'timeout' in lower_message:
            return ModelUnavailableError(message, code='MODEL_UNAVAILABLE')
        return ModelUnavailableError(message, code='MODEL_RUNTIME_ERROR')

    def _raise_ai2_status_error(self, response: httpx.Response) -> None:
        if response.status_code < 400:
            return

        detail = response.text[:500]
        if response.status_code in (401, 403):
            raise ModelUnavailableError(
                'AI2 authentication failed. Kiem tra AI2_API_KEY.',
                code='MODEL_CONFIGURATION_ERROR',
            )
        if response.status_code == 404:
            raise ModelUnavailableError(
                f'AI2 endpoint or model not found: {detail}',
                code='MODEL_UNAVAILABLE',
            )
        if response.status_code == 429:
            raise ModelUnavailableError(
                f'AI2 rate limit exceeded: {detail}',
                code='MODEL_RATE_LIMITED',
            )
        if response.status_code >= 500:
            raise ModelUnavailableError(
                f'AI2 provider error: {detail}',
                code='MODEL_RUNTIME_ERROR',
            )
        raise ModelUnavailableError(
            f'AI2 request failed with status {response.status_code}: {detail}',
            code='MODEL_RUNTIME_ERROR',
        )

    async def _generate_with_gemini(
        self,
        prompt: str,
        system_prompt: str | None = None,
    ) -> str:
        import google.generativeai as genai  # type: ignore[import-untyped]
        from google.api_core.exceptions import ResourceExhausted

        api_keys_str = os.getenv('GEMINI_API_KEYS', '')
        api_keys = [k.strip() for k in api_keys_str.split(',') if k.strip()]

        if not api_keys:
            single_key = os.getenv('GEMINI_API_KEY', '')
            if single_key:
                api_keys = [single_key]

        if not api_keys:
            raise ValueError('No Gemini API key configured')

        model_names_str = os.getenv(
            'GEMINI_MODEL_NAMES',
            'gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.5-pro,gemini-3-pro-preview,gemini-2.0-flash,gemini-2.0-flash-001,gemini-2.0-flash-lite,gemini-2.0-flash-lite-001',
        )
        model_names = [m.strip() for m in model_names_str.split(',') if m.strip()]

        if self._runtime_gemini_model and self._runtime_gemini_model not in model_names:
            model_names.insert(0, self._runtime_gemini_model)

        last_error = None
        for api_key in api_keys:
            for model_name in model_names:
                try:
                    configure = getattr(genai, 'configure')
                    generative_model_cls = getattr(genai, 'GenerativeModel')
                    generation_types = getattr(genai, 'types')

                    configure(api_key=api_key)
                    model = generative_model_cls(model_name)
                    loop = asyncio.get_running_loop()
                    final_prompt = (
                        f"{system_prompt}\n\nUSER TASK:\n{prompt}"
                        if system_prompt
                        else prompt
                    )
                    response = await loop.run_in_executor(
                        None,
                        lambda: model.generate_content(
                            final_prompt,
                            generation_config=generation_types.GenerationConfig(
                                temperature=self.get_temperature(),
                                max_output_tokens=self.get_max_tokens(),
                            ),
                        ),
                    )
                    return response.text
                except ResourceExhausted as error:
                    last_error = error
                    continue
                except Exception as error:
                    last_error = error
                    continue

        raise last_error or ValueError('All API keys and models exhausted')

    async def _generate_with_ai2(
        self,
        prompt: str,
        model_id: str,
        system_prompt: str | None = None,
    ) -> str:
        api_key = os.getenv('AI2_API_KEY')
        if not api_key:
            raise ModelUnavailableError(
                'AI2_API_KEY chua duoc cau hinh cho tac vu sinh content.',
                code='MODEL_CONFIGURATION_ERROR',
            )

        ai2_info = self.get_ai2_info(model_id)
        url = f"{ai2_info['url']}/chat/completions"
        messages = []
        if system_prompt:
            messages.append({'role': 'system', 'content': system_prompt})
        messages.append({'role': 'user', 'content': prompt})
        payload = {
            'model': ai2_info['model'],
            'messages': messages,
            'temperature': self.get_temperature(),
            'max_tokens': self.get_ai2_max_tokens(),
            'stream': False,
        }
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }

        max_retries = 3
        last_error: Exception | None = None
        client = self._get_ai2_client()
        for attempt in range(max_retries):
            try:
                response = await client.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=ai2_info['timeout'],
                )
                if response.status_code in (429, 500, 502, 503, 504) and attempt < max_retries - 1:
                    last_error = ModelUnavailableError(
                        f'AI2 transient error status={response.status_code}',
                        code='MODEL_RUNTIME_ERROR',
                    )
                    await asyncio.sleep((attempt + 1) * 2)
                    continue
                self._raise_ai2_status_error(response)
                data = response.json()
                choices = data.get('choices') if isinstance(data, dict) else None
                if not choices or not isinstance(choices, list):
                    raise ModelUnavailableError('AI2 response missing choices.', code='MODEL_RUNTIME_ERROR')
                message = choices[0].get('message') if isinstance(choices[0], dict) else None
                content = message.get('content') if isinstance(message, dict) else None
                if isinstance(content, list):
                    content = ''.join(
                        item.get('text', '') if isinstance(item, dict) else str(item)
                        for item in content
                    )
                if not isinstance(content, str):
                    raise ModelUnavailableError('AI2 response missing message content.', code='MODEL_RUNTIME_ERROR')
                return content
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as error:
                last_error = error
                if attempt < max_retries - 1:
                    await asyncio.sleep((attempt + 1) * 2)
                    continue
                raise self._normalize_model_error(error)
            except ModelUnavailableError:
                raise
            except Exception as error:
                raise self._normalize_model_error(error)

        raise self._normalize_model_error(last_error or Exception('AI2 generation failed'))

    async def generate_content_with_model(
        self,
        prompt: str,
        ai_model_type: str | None = None,
        response_model: Any = None,
        system_prompt: str | None = None,
    ) -> str:
        model_id = str(ai_model_type) if ai_model_type else None
        model = self.resolve_model(model_id)

        await self.ensure_generation_model_ready(model.id)

        if model.provider == 'ai2':
            return await self._generate_with_ai2(prompt, model.id, system_prompt=system_prompt)
        return await self._generate_with_gemini(prompt, system_prompt=system_prompt)

    def get_langchain_model(self, ai_model_type: str | None = None):
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_openai import ChatOpenAI

        model_id = str(ai_model_type) if ai_model_type else None
        model = self.resolve_model(model_id)

        if model.provider == 'ai2':
            api_key = os.getenv('AI2_API_KEY')
            if not api_key:
                raise ModelUnavailableError(
                    'AI2_API_KEY chua duoc cau hinh cho tac vu sinh content.',
                    code='MODEL_CONFIGURATION_ERROR',
                )
            return ChatOpenAI(
                model=model.runtime_model_name,
                api_key=api_key,
                base_url=self.get_ai2_base_url(),
                temperature=self.get_temperature(),
                max_tokens=self.get_max_tokens(),
            )

        if model.provider == 'gemini':
            gemini_info = self.get_gemini_info(model.id)
            api_keys_str = os.getenv('GEMINI_API_KEYS', '')
            api_key = api_keys_str.split(',')[0].strip() if api_keys_str else os.getenv('GEMINI_API_KEY')
            return ChatGoogleGenerativeAI(
                model=gemini_info['model'],
                google_api_key=api_key,
                temperature=self.get_temperature(),
                max_output_tokens=self.get_max_tokens(),
                convert_system_message_to_human=True,
            )

        return self.get_langchain_model('gemini')


model_manager = ModelManager()
