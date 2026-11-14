"""Chat use-cases of the gRPC servicer.

Callers (content / ai-chat) have already authorized the ``user_storage_id`` they
pass; this module does retrieval + answering and never touches another
service's tables.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from src.backend.services.sync_stream import aiter_blocking
from src.graphrag import graphrag_retrieval
from src.llm.model_manager import model_manager
from src.rag.retriever import create_in_memory_retriever
from src.rag.simple_chat_agent import SimpleChatAgent

logger = logging.getLogger(__name__)

# Caps bound the cost/memory of one request (untrusted client text).
QUERY_MAX_LENGTH = 8000
SYSTEM_PROMPT_MAX_LENGTH = 4000
HISTORY_ITEM_MAX_LENGTH = 8000
HISTORY_MAX_ITEMS = 200
QUERY_HISTORY_TURNS = 5
STREAM_TOP_K = 8
STREAM_MAX_CONTENT_LENGTH = 8000


class ChatInputError(ValueError):
    """The request violates a size limit or names an unknown model."""


@dataclass
class ChatParams:
    """A chat request after transport-level decoding."""

    query: str
    history: list[dict[str, str]] = field(default_factory=list)
    user_storage_id: str | None = None
    model_type: str | None = None
    system_prompt: str | None = None

    def validate(self) -> None:
        """Raise :class:`ChatInputError` when a limit is exceeded."""
        if len(self.query) > QUERY_MAX_LENGTH:
            raise ChatInputError(f"query exceeds {QUERY_MAX_LENGTH} characters")
        if len(self.history) > HISTORY_MAX_ITEMS:
            raise ChatInputError(f"history exceeds {HISTORY_MAX_ITEMS} items")
        if any(len(m["content"]) > HISTORY_ITEM_MAX_LENGTH for m in self.history):
            raise ChatInputError(f"history item exceeds {HISTORY_ITEM_MAX_LENGTH} characters")
        if self.system_prompt and len(self.system_prompt) > SYSTEM_PROMPT_MAX_LENGTH:
            raise ChatInputError(f"system_prompt exceeds {SYSTEM_PROMPT_MAX_LENGTH} characters")


def resolve_model_id(model_type: str | None) -> str:
    """Resolve a model id from the registry; unknown ids raise :class:`ChatInputError`."""
    try:
        return model_manager.resolve_model(model_type).id
    except ValueError as exc:
        raise ChatInputError(str(exc)) from exc


def new_error_ref() -> str:
    """Correlation reference put in client-facing errors instead of raw error text."""
    return uuid.uuid4().hex


async def answer_query(params: ChatParams) -> tuple[str, list[dict[str, Any]]]:
    """Non-streaming chat: returns ``(answer, sources)``."""
    params.validate()
    model_id = resolve_model_id(params.model_type)
    retriever = None
    sources: list[dict[str, Any]] = []
    pre_context = None
    if params.user_storage_id:
        result = await graphrag_retrieval.retrieve_for_chat(
            user_storage_id=params.user_storage_id,
            query=params.query,
            model_type=model_id,
        )
        pre_context = result.combined_context
        sources = result.sources
        if pre_context:
            retriever, _ = create_in_memory_retriever(pre_context)

    agent = SimpleChatAgent(
        custom_retriever=retriever, model_type=model_id, pre_context=pre_context, system_prompt=None
    )
    full_query = params.query
    if params.history:
        recent = "\n".join(f"{m['role']}: {m['content']}" for m in params.history[-QUERY_HISTORY_TURNS:])
        full_query = f"Conversation history:\n{recent}\n\nUser: {params.query}"
    answer = await asyncio.to_thread(agent.chat, full_query)
    return answer, sources


async def stream_chat(params: ChatParams) -> AsyncIterator[dict[str, Any]]:
    """Streaming chat as frames: ``started``, ``chunk``..., then ``done`` or ``error``.

    Validation and model resolution errors raise before the first frame (they map
    to gRPC statuses); failures after ``started`` become an ``error`` frame.
    Cancelling the consumer stops the LLM stream (see ``aiter_blocking``).
    """
    params.validate()
    model_id = resolve_model_id(params.model_type)
    yield {"type": "started"}
    answer_parts: list[str] = []
    sources: list[dict[str, Any]] = []
    try:
        pre_context = None
        if params.user_storage_id:
            result = await graphrag_retrieval.retrieve_for_chat(
                user_storage_id=params.user_storage_id,
                query=params.query,
                model_type=model_id,
                top_k=STREAM_TOP_K,
                max_content_length=STREAM_MAX_CONTENT_LENGTH,
            )
            pre_context = result.combined_context
            sources = result.sources
        agent = SimpleChatAgent(
            pre_context=pre_context, model_type=model_id, system_prompt=params.system_prompt
        )
        async for chunk in aiter_blocking(lambda: agent.chat_stream(params.query, history=params.history)):
            text = str(chunk)
            answer_parts.append(text)
            yield {"type": "chunk", "data": text}
        yield {"type": "done", "answer": "".join(answer_parts), "sources": sources}
    except Exception as exc:  # a failure mid-stream is a frame, not a status
        ref = new_error_ref()
        logger.error("Error in stream chat [%s]: %s", ref, exc, exc_info=True)
        yield {
            "type": "error",
            "message": f"Internal error while streaming response (ref: {ref})",
            "code": getattr(exc, "code", None),
        }
