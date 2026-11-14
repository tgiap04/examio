"""LLM-as-judge helpers (Vietnamese prompts, strict JSON parsing; failure -> None, never 0)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from src.llm.model_manager import model_manager

logger = logging.getLogger(__name__)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

CLUSTER_PROMPT = """Bạn là giám khảo chất lượng bộ câu hỏi trắc nghiệm.
Dưới đây là {n} câu hỏi (đánh số từ 1). Hãy gom các câu cùng kiểm tra MỘT khái niệm/ý kiến thức
thành một nhóm; câu chỉ diễn đạt lại nhau vẫn thuộc cùng nhóm.
Chỉ trả về JSON đúng dạng {{"clusters": <số nhóm khác nhau>}}, không giải thích.

{items}
"""

GRADE_PROMPT = """Bạn là giám khảo chấm câu trả lời của trợ lý hỏi đáp tài liệu.
Câu hỏi: {question}
Các ý chính cần có ({n} ý):
{key_points}

Ngữ cảnh nguồn đã truy xuất:
{sources}

Câu trả lời cần chấm:
{answer}

Chấm theo thang:
- correct: 0 (sai), 1 (đúng một phần), 2 (đúng hoàn toàn)
- key_points_covered: số ý chính (0..{n}) mà câu trả lời nêu đúng
- grounded: 1 nếu mọi khẳng định đều có trong ngữ cảnh nguồn, ngược lại 0
Chỉ trả về JSON {{"correct": 0-2, "key_points_covered": 0-{n}, "grounded": 0-1}}, không giải thích.
"""


def _load_json(text: str) -> dict[str, Any] | None:
    try:
        data = json.loads(_FENCE.sub("", (text or "").strip()))
    except (ValueError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def parse_cluster_count(text: str, total: int) -> int | None:
    """Parse the clustering reply into a cluster count within ``1..total``; else None."""
    data = _load_json(text)
    if data is None:
        return None
    value = data.get("clusters")
    if isinstance(value, list):
        value = len(value)
    if not _is_int(value) or not 1 <= value <= total:
        return None
    return value


def parse_answer_grade(text: str, n_key_points: int) -> dict[str, float | int] | None:
    """Parse a grading reply into ``{correct, complete, grounded}``; None when invalid."""
    data = _load_json(text)
    if data is None:
        return None
    correct = data.get("correct")
    covered = data.get("key_points_covered")
    grounded = data.get("grounded")
    if not (_is_int(correct) and 0 <= correct <= 2):
        return None
    if not (_is_int(covered) and 0 <= covered <= max(n_key_points, 0)):
        return None
    if not (_is_int(grounded) and grounded in (0, 1)):
        return None
    complete = covered / n_key_points if n_key_points else 1.0
    return {"correct": correct, "complete": complete, "grounded": float(grounded)}


async def _ask(prompt: str, judge_model: str | None) -> str | None:
    try:
        return await model_manager.generate_content_with_model(prompt, judge_model)
    except Exception:
        logger.exception("judge call failed")
        return None


async def judge_quiz_clusters(questions: list[str], judge_model: str | None = None) -> int | None:
    """Ask the judge how many distinct concepts the questions cover; None on failure."""
    if not questions:
        return None
    items = "\n".join(f"{i}. {q}" for i, q in enumerate(questions, 1))
    reply = await _ask(CLUSTER_PROMPT.format(n=len(questions), items=items), judge_model)
    return None if reply is None else parse_cluster_count(reply, len(questions))


def judge_duplicate_rate(clusters: int | None, items: int) -> float | None:
    """1 - clusters/items; None when the judge failed or there are no items."""
    if clusters is None or items < 1:
        return None
    return 1.0 - clusters / items


async def judge_answer(
    question: str,
    key_points: list[str],
    answer: str,
    sources: list[dict[str, Any]],
    judge_model: str | None = None,
) -> dict[str, float | int] | None:
    """Grade a chat answer against the key points; None on judge or parse failure."""
    src = "\n".join(f"- {str(s)[:600]}" for s in sources[:8]) or "(không có)"
    points = "\n".join(f"{i}. {p}" for i, p in enumerate(key_points, 1))
    prompt = GRADE_PROMPT.format(
        question=question, key_points=points, n=len(key_points), sources=src, answer=answer
    )
    reply = await _ask(prompt, judge_model)
    return None if reply is None else parse_answer_grade(reply, len(key_points))
