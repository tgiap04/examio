"""Gemini embeddings client used by OCR/RAG ingestion."""

import asyncio
import logging
import math
import os
import time
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_EMBED_MAX_LENGTH = 2000
DEFAULT_GEMINI_EMBED_BATCH_SIZE = 5
DEFAULT_GEMINI_EMBED_MAX_BATCH_SIZE = 8
DEFAULT_GEMINI_EMBED_MAX_CONCURRENCY = 5
DEFAULT_GEMINI_EMBED_MAX_CONCURRENCY_CAP = 5
DEFAULT_GEMINI_EMBED_DELAY_BETWEEN_BATCHES = 0.02
DEFAULT_GEMINI_EMBED_RETRY_COUNT = 3
DEFAULT_GEMINI_EMBED_RETRY_BASE_DELAY = 0.75
DEFAULT_GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")


def _get_int_env(name: str, default: int, min_value: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        return max(min_value, value)
    except ValueError:
        logger.warning("Invalid %s=%r, using default=%s", name, raw, default)
        return default


def _get_float_env(name: str, default: float, min_value: float = 0.0) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
        return max(min_value, value)
    except ValueError:
        logger.warning("Invalid %s=%r, using default=%s", name, raw, default)
        return default


def _get_gemini_api_keys() -> list[str]:
    api_keys_str = os.getenv("GEMINI_API_KEYS", "")
    api_keys = [key.strip() for key in api_keys_str.split(",") if key.strip()]
    single_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if single_key and single_key.strip() not in api_keys:
        api_keys.append(single_key.strip())
    return api_keys


def get_embedding_text_limit() -> int:
    return _get_int_env("GEMINI_EMBED_MAX_LENGTH", DEFAULT_GEMINI_EMBED_MAX_LENGTH)


class GeminiEmbeddings:
    """Async Gemini embedding client with bounded batch concurrency."""

    _instance = None

    def __new__(cls, *_args, **_kwargs):
        if cls._instance is None:
            cls._instance = super(GeminiEmbeddings, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, model: str | None = None, **_: object):
        if self._initialized:
            if model:
                self.model = model
            return

        self.model = model or os.getenv("GEMINI_EMBEDDING_MODEL", DEFAULT_GEMINI_EMBED_MODEL)
        self.embed_max_length = get_embedding_text_limit()
        self.default_batch_size = _get_int_env("GEMINI_EMBED_BATCH_SIZE", DEFAULT_GEMINI_EMBED_BATCH_SIZE)
        self.max_batch_size = _get_int_env("GEMINI_EMBED_MAX_BATCH_SIZE", DEFAULT_GEMINI_EMBED_MAX_BATCH_SIZE)
        self.max_concurrency = _get_int_env("GEMINI_EMBED_MAX_CONCURRENCY", DEFAULT_GEMINI_EMBED_MAX_CONCURRENCY)
        self.max_concurrency_cap = _get_int_env("GEMINI_EMBED_MAX_CONCURRENCY_CAP", DEFAULT_GEMINI_EMBED_MAX_CONCURRENCY_CAP)
        self.default_delay_between_batches = _get_float_env(
            "GEMINI_EMBED_DELAY_BETWEEN_BATCHES",
            DEFAULT_GEMINI_EMBED_DELAY_BETWEEN_BATCHES,
        )
        self.retry_count = _get_int_env("GEMINI_EMBED_RETRY_COUNT", DEFAULT_GEMINI_EMBED_RETRY_COUNT)
        self.retry_base_delay = _get_float_env("GEMINI_EMBED_RETRY_BASE_DELAY", DEFAULT_GEMINI_EMBED_RETRY_BASE_DELAY)
        self._initialized = True
        logger.info(
            "GeminiEmbeddings initialized: model=%s max_length=%s batch_size=%s max_batch_size=%s max_concurrency=%s",
            self.model,
            self.embed_max_length,
            self.default_batch_size,
            self.max_batch_size,
            self.max_concurrency,
        )

    def _is_retryable_error(self, error: Exception) -> bool:
        message = str(error).lower()
        return any(token in message for token in ("429", "500", "502", "503", "504", "timeout", "quota", "rate"))

    async def _sleep_before_retry(self, attempt: int) -> None:
        await asyncio.sleep(self.retry_base_delay * (2 ** max(0, attempt - 1)))

    def _embed_sync(self, text: str, task_type: str) -> List[float]:
        import google.generativeai as genai  # type: ignore[import-untyped]

        api_keys = _get_gemini_api_keys()
        if not api_keys:
            raise ValueError("No Gemini API key configured for embeddings")

        last_error: Exception | None = None
        for api_key in api_keys:
            try:
                genai.configure(api_key=api_key)
                result = genai.embed_content(
                    model=self.model,
                    content=text,
                    task_type=task_type.upper(),
                )
                embedding = result.get("embedding") if isinstance(result, dict) else None
                if not embedding:
                    raise ValueError("Gemini embedding response missing embedding")
                return [float(value) for value in embedding]
            except Exception as error:
                last_error = error
                continue
        raise last_error or ValueError("Gemini embedding failed")

    def embed_query(self, text: str) -> List[float]:
        return self._embed_sync(text[: self.embed_max_length], "retrieval_query")

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_sync(text[: self.embed_max_length], "retrieval_document") for text in texts]

    async def create_embedding(self, text: str, task_type: str = "retrieval_document") -> List[float]:
        if len(text) > self.embed_max_length:
            logger.warning("Truncating text from %s to %s chars for embedding", len(text), self.embed_max_length)
            text = text[: self.embed_max_length]

        normalized_task_type = "retrieval_query" if task_type == "retrieval_query" else "retrieval_document"
        last_error: Exception | None = None
        for attempt in range(1, self.retry_count + 1):
            try:
                loop = asyncio.get_running_loop()
                return await loop.run_in_executor(None, lambda: self._embed_sync(text, normalized_task_type))
            except Exception as error:
                last_error = error
                logger.error("Gemini embedding error (attempt %s/%s): %s", attempt, self.retry_count, error)
                if attempt < self.retry_count and self._is_retryable_error(error):
                    await self._sleep_before_retry(attempt)
                    continue
                break

        raise Exception(f"Gemini embedding failed: {last_error}")

    async def create_embeddings_batch(
        self,
        texts: List[str],
        task_type: str = "retrieval_document",
        batch_size: Optional[int] = None,
        delay_between_batches: Optional[float] = None,
    ) -> List[List[float]]:
        if not texts:
            return []

        resolved_batch_size = max(1, min(batch_size or self.default_batch_size, self.max_batch_size))
        resolved_delay = max(0.0, delay_between_batches if delay_between_batches is not None else self.default_delay_between_batches)
        resolved_max_concurrency = max(1, min(self.max_concurrency, self.max_concurrency_cap))
        semaphore = asyncio.Semaphore(resolved_max_concurrency)

        async def _embed_with_limit(input_text: str) -> List[float]:
            async with semaphore:
                return await self.create_embedding(input_text, task_type)

        total_batches = math.ceil(len(texts) / resolved_batch_size)
        start_time = time.perf_counter()
        embeddings: List[List[float]] = []

        for index in range(0, len(texts), resolved_batch_size):
            batch = texts[index : index + resolved_batch_size]
            batch_embeddings = await asyncio.gather(
                *[_embed_with_limit(text) for text in batch],
                return_exceptions=True,
            )
            for offset, embedding in enumerate(batch_embeddings):
                if isinstance(embedding, Exception):
                    try:
                        embedding = await _embed_with_limit(batch[offset])
                    except Exception as error:
                        raise Exception(f"Failed to embed text {index + offset}: {error}")
                if isinstance(embedding, Exception):
                    raise embedding
                embeddings.append(embedding)

            if index + resolved_batch_size < len(texts) and resolved_delay > 0:
                await asyncio.sleep(resolved_delay)

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info(
            "[AI_TIMING] stage=embedding_batch provider=gemini texts=%s batches=%s batch_size=%s max_concurrency=%s elapsed_ms=%s",
            len(texts),
            total_batches,
            resolved_batch_size,
            resolved_max_concurrency,
            elapsed_ms,
        )
        return embeddings


gemini_embeddings = GeminiEmbeddings()
