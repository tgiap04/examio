"""HTTP compat routes (``AI_HTTP_COMPAT=true``) for callers not yet on gRPC.

Same behaviour as the gRPC ``Query`` / ``StreamChat`` / ``GenerateWordFamily``
calls, protected by the legacy ``INTERNAL_SERVICE_TOKEN`` middleware until phase
13 moves ai-chat and vocabulary to gRPC. Delete this module then.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from src.backend.ai_grpc_mapping import MODEL_ERROR_CODES
from src.backend.services.chat_service import (
    HISTORY_ITEM_MAX_LENGTH,
    HISTORY_MAX_ITEMS,
    QUERY_MAX_LENGTH,
    SYSTEM_PROMPT_MAX_LENGTH,
    ChatInputError,
    ChatParams,
    answer_query,
    new_error_ref,
    resolve_model_id,
    stream_chat,
)
from src.backend.services.generation_service import (
    WordFamilyRequest,
    generation_service,
)
from src.llm.model_manager import ModelUnavailableError

logger = logging.getLogger(__name__)
router = APIRouter()


class Message(BaseModel):
    """One conversation turn."""

    role: str
    content: str = Field(..., max_length=HISTORY_ITEM_MAX_LENGTH)


class ChatRequest(BaseModel):
    """Body of ``/chat/query`` and ``/chat/stream``."""

    model_config = ConfigDict(populate_by_name=True)

    query: str = Field(..., max_length=QUERY_MAX_LENGTH)
    history: list[Message] = Field(default=[], max_length=HISTORY_MAX_ITEMS)
    user_storage_id: str | None = None
    department: str | None = None
    model_type: str | None = Field(default=None, alias="modelType")
    system_prompt: str | None = Field(default=None, alias="systemPrompt", max_length=SYSTEM_PROMPT_MAX_LENGTH)

    def to_params(self) -> ChatParams:
        """Convert to the transport-neutral parameters."""
        return ChatParams(
            query=self.query,
            history=[{"role": m.role, "content": m.content} for m in self.history],
            user_storage_id=self.user_storage_id,
            model_type=self.model_type,
            system_prompt=self.system_prompt,
        )


class GenerateWordFamilyBody(BaseModel):
    """Body of ``/generate/word-family``."""

    categorySlug: str  # noqa: N815 - wire name
    categoryName: str  # noqa: N815 - wire name
    numRootWords: int = Field(default=10, ge=1, le=20)  # noqa: N815
    excludeRootWords: list[str] = Field(default_factory=list, max_length=50)  # noqa: N815
    rootWord: str | None = None  # noqa: N815
    modelType: str | None = None  # noqa: N815


def _model_error(exc: ModelUnavailableError) -> HTTPException:
    return HTTPException(status_code=503, detail={"code": exc.code, "message": str(exc)})


@router.post("/chat/query")
async def query_ai(request: ChatRequest) -> dict[str, Any]:
    """Answer a question, optionally grounded in one document."""
    try:
        answer, sources = await answer_query(request.to_params())
    except ModelUnavailableError as exc:
        raise _model_error(exc) from exc
    except ChatInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        ref = new_error_ref()
        logger.error("Error in query [%s]: %s", ref, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error while processing query (ref: {ref})") from exc
    return {"answer": answer, "sources": sources, "timestamp": datetime.now(UTC).isoformat()}


@router.post("/chat/stream")
async def stream_ai(request: ChatRequest) -> StreamingResponse:
    """Server-sent events with the same frames as the gRPC ``StreamChat``."""
    frames = stream_chat(request.to_params())
    try:
        first = await frames.__anext__()  # pre-stream failures are HTTP statuses
    except ModelUnavailableError as exc:
        raise _model_error(exc) from exc
    except ChatInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def encode(frame: dict[str, Any]) -> str:
        if frame["type"] == "done":
            body = {
                "type": "done",
                "data": {
                    "assistantMessage": {
                        "role": "assistant",
                        "content": frame["answer"],
                        "createdAt": datetime.now(UTC).isoformat(),
                    },
                    "sources": frame["sources"],
                },
            }
        elif frame["type"] == "error":
            body = {"type": "error", "data": frame["message"], "code": frame.get("code")}
        else:
            body = {key: value for key, value in frame.items()}
        return f"data: {json.dumps(body)}\n\n"

    async def sse():
        yield encode(first)
        async for frame in frames:
            yield encode(frame)

    return StreamingResponse(sse(), media_type="text/event-stream")


@router.post("/generate/word-family")
async def generate_word_family(body: GenerateWordFamilyBody) -> dict[str, Any]:
    """Generate a word family for a category or a given root word."""
    try:
        resolve_model_id(body.modelType)
        result = await generation_service.generate_word_family(
            WordFamilyRequest(
                category_slug=body.categorySlug,
                category_name=body.categoryName,
                num_root_words=body.numRootWords,
                exclude_root_words=body.excludeRootWords,
                root_word=body.rootWord,
                model_type=body.modelType,
            )
        )
    except ChatInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        raise _model_error(exc) from exc
    if not result.get("success"):
        if result.get("error_code") in MODEL_ERROR_CODES:
            raise HTTPException(
                status_code=result.get("status_code", 503),
                detail={"code": result["error_code"], "message": result.get("error", "Model unavailable")},
            )
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to generate word family"))
    return result
