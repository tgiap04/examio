"""Eval harness for RAG quality (quiz duplicates, page coverage, chat answer grading).

Calls only the public generation/chat functions, so it works for any retrieval path.
Never writes to the DB. Usage::

    python -m src.backend.scripts.eval_rag_quality --storage-ids ID1,ID2 --out out.json --label baseline
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

from src.backend.eval.judge import (
    judge_answer,
    judge_duplicate_rate,
    judge_quiz_clusters,
)
from src.backend.eval.metrics import duplicate_rate, page_coverage

logger = logging.getLogger("eval_rag_quality")
DEFAULT_DATASET = Path(__file__).resolve().parents[1] / "eval" / "datasets" / "rag_eval_v1.json"


def load_dataset(path: Path) -> dict[str, dict[str, Any]]:
    """Load the dataset and index documents by storageId; raise ValueError on bad shape."""
    data = json.loads(path.read_text(encoding="utf-8"))
    docs = data.get("documents") if isinstance(data, dict) else None
    if not isinstance(docs, list):
        raise ValueError("dataset must hold a 'documents' list")
    index: dict[str, dict[str, Any]] = {}
    for doc in docs:
        if not isinstance(doc, dict) or not doc.get("storageId"):
            raise ValueError("each document needs a storageId")
        index[str(doc["storageId"])] = doc
    return index


async def _embed(texts: list[str]) -> list[list[float]]:
    from src.llm.gemini_embeddings import GeminiEmbeddings

    return await asyncio.to_thread(GeminiEmbeddings().embed_documents, texts)


async def eval_quiz(storage_id: str, count: int, judge_model: str | None, total_pages: int | None) -> dict[str, Any]:
    """Generate a quiz and compute duplicate / coverage metrics."""
    from src.backend.services.generation_service import (
        GenerateQuizRequest,
        generation_service,
    )

    result = await generation_service.generate_quiz(GenerateQuizRequest(user_storage_id=storage_id, num_questions=count))
    if not result.get("success"):
        return {"error": result.get("error", "generation failed")}
    quizzes = result.get("quizzes") or []
    questions = [str(q.get("question", "")) if isinstance(q, dict) else str(getattr(q, "question", "")) for q in quizzes]
    ranges = [q.get("sourcePageRange") if isinstance(q, dict) else getattr(q, "source_page_range", None) for q in quizzes]
    out: dict[str, Any] = {"count": len(questions), "retrieval_mode": result.get("retrieval_mode")}
    try:
        out["embedding_duplicate_rate"] = duplicate_rate(await _embed(questions)) if questions else None
    except Exception as exc:
        logger.exception("embedding failed")
        out["embedding_duplicate_rate"] = None
        out["embedding_error"] = str(exc)
    clusters = await judge_quiz_clusters(questions, judge_model)
    out["judge_clusters"] = clusters
    out["judge_duplicate_rate"] = judge_duplicate_rate(clusters, len(questions))
    out["page_coverage"] = page_coverage(ranges, total_pages) if total_pages else None
    out["questions"] = questions
    return out


async def eval_chat(storage_id: str, questions: list[dict[str, Any]], judge_model: str | None) -> list[dict[str, Any]]:
    """Ask each dataset question and grade the answers."""
    from src.backend.services.chat_service import ChatParams, answer_query

    rows: list[dict[str, Any]] = []
    for item in questions:
        row: dict[str, Any] = {"question": item["question"], "type": item.get("type")}
        try:
            answer, sources = await answer_query(ChatParams(query=item["question"], user_storage_id=storage_id))
            row["answer"] = answer
            row["grade"] = await judge_answer(item["question"], item.get("keyPoints", []), answer, sources, judge_model)
        except Exception as exc:
            logger.exception("chat eval failed")
            row["error"] = str(exc)
        rows.append(row)
    return rows


async def run(args: argparse.Namespace) -> dict[str, Any]:
    """Evaluate every requested storage id, appending to ``--out`` when resuming."""
    dataset = load_dataset(Path(args.dataset))
    out_path = Path(args.out)
    report: dict[str, Any] = {"label": args.label, "documents": {}}
    if args.resume and out_path.exists():
        report = json.loads(out_path.read_text(encoding="utf-8"))
    for sid in [s.strip() for s in args.storage_ids.split(",") if s.strip()]:
        if sid in report["documents"]:
            logger.info("skip %s (already in %s)", sid, out_path)
            continue
        doc = dataset.get(sid, {})
        report["documents"][sid] = {
            "title": doc.get("title"),
            "quiz": await eval_quiz(sid, args.quiz_count, args.judge_model, doc.get("totalPages")),
            "chat": await eval_chat(sid, doc.get("questions", []), args.judge_model),
        }
        out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments."""
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--storage-ids", required=True, help="comma-separated UserStorage ids")
    p.add_argument("--dataset", default=str(DEFAULT_DATASET))
    p.add_argument("--out", required=True)
    p.add_argument("--label", default="run")
    p.add_argument("--resume", action="store_true")
    p.add_argument("--quiz-count", type=int, default=20)
    p.add_argument("--judge-model", default=None)
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    logging.basicConfig(level=logging.INFO)
    args = parse_args(argv)
    asyncio.run(run(args))
    sys.stdout.write(f"{args.out}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
