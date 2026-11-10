"""Pure conversions between ai-service dicts and ``kmaedu.ai.v1`` messages."""

from __future__ import annotations

import time
from typing import Any

from src.backend.grpc_generated.kmaedu.ai.v1 import ai_pb2

MODEL_ERROR_CODES = frozenset(
    {
        "MODEL_UNAVAILABLE",
        "MODEL_INSUFFICIENT_VRAM",
        "MODEL_RUNTIME_ERROR",
        "MODEL_CONFIGURATION_ERROR",
    }
)
ERROR_CODE_TRAILER = "x-error-code"


def now_ms() -> int:
    """Return the current time as Unix epoch milliseconds."""
    return int(time.time() * 1000)


def to_sources(sources: list[dict[str, Any]]) -> list[ai_pb2.ChatSource]:
    """Convert retrieval sources (``chunkId`` camelCase dicts) to ``ChatSource``."""
    return [
        ai_pb2.ChatSource(
            content=s.get("content") or "",
            page=str(s.get("page") or ""),
            title=s.get("title") or "",
            chunk_id=s.get("chunkId") or "",
        )
        for s in sources
    ]


def frame_to_proto(frame: dict[str, Any]) -> ai_pb2.StreamChatResponse:
    """Convert one ``stream_chat`` frame to a ``StreamChatResponse``."""
    kind = frame["type"]
    if kind == "started":
        return ai_pb2.StreamChatResponse(started=ai_pb2.StreamStarted())
    if kind == "chunk":
        return ai_pb2.StreamChatResponse(chunk=frame["data"])
    if kind == "done":
        return ai_pb2.StreamChatResponse(
            done=ai_pb2.StreamDone(
                assistant_message=ai_pb2.ChatMessage(role="assistant", content=frame["answer"]),
                created_at=now_ms(),
                sources=to_sources(frame["sources"]),
            )
        )
    error = ai_pb2.StreamError(message=frame["message"])
    if frame.get("code"):
        error.code = frame["code"]
    return ai_pb2.StreamChatResponse(error=error)


def to_model_info(dto: dict[str, Any]) -> ai_pb2.ModelInfo:
    """Convert a frontend model DTO (camelCase) to ``ModelInfo``."""
    info = ai_pb2.ModelInfo(
        id=dto["id"],
        name=dto.get("name") or "",
        description=dto.get("description") or "",
        provider=dto.get("provider") or "",
        runtime_model_name=dto.get("runtimeModelName") or "",
        badge=dto.get("badge") or "",
        disabled=bool(dto.get("disabled")),
        is_default=bool(dto.get("isDefault")),
        supports_structured_output=bool(dto.get("supportsStructuredOutput")),
        specs=[ai_pb2.ModelSpec(label=s["label"], value=s["value"]) for s in dto.get("specs", [])],
        available=bool(dto.get("available", True)),
    )
    if dto.get("availabilityReason"):
        info.availability_reason = dto["availabilityReason"]
    return info


def to_catalog(catalog: dict[str, Any]) -> ai_pb2.ListModelsResponse:
    """Convert ``get_frontend_model_catalog()`` output to ``ListModelsResponse``."""
    return ai_pb2.ListModelsResponse(
        embedding_model=to_model_info(catalog["embeddingModel"]),
        generation_models=[to_model_info(m) for m in catalog["generationModels"]],
        default_generation_model=catalog["defaultGenerationModel"],
    )


def to_word_family(data: dict[str, Any]) -> ai_pb2.WordFamilyData:
    """Convert ``WordFamilyData.model_dump()`` to the proto message."""
    return ai_pb2.WordFamilyData(
        root_word=data["rootWord"],
        category_slug=data["categorySlug"],
        words=[
            ai_pb2.WordFamilyWord(
                word=w["word"],
                pos=w["pos"],
                meaning_en=w["meaningEn"],
                meaning_vi=w["meaningVi"],
                example=w["example"],
                affix=ai_pb2.WordAffix(
                    prefix=w["affix"]["prefix"], root=w["affix"]["root"], suffix=w["affix"]["suffix"]
                ),
            )
            for w in data["words"]
        ],
    )
