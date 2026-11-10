"""ai-service SQL touches only the ai schema: no UserStorage / HistoryGenerated*, no runtime DDL."""

import ast
import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[3] / "src"
SKIP = ("grpc_generated", "evaluation")  # generated stubs; offline benchmark harness (no DB)
SQL = re.compile(r"\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN)\b")
FOREIGN = re.compile(r'"?\b(UserStorage|HistoryGenerated\w*)\b"?')
DDL = re.compile(r"\bCREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX|EXTENSION|SCHEMA)\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b", re.I)


def sql_strings():
    """Yield (path, line, text) for every non-docstring string literal that looks like SQL."""
    for path in sorted(SRC.rglob("*.py")):
        if any(part in path.parts for part in SKIP) or "tests" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        docstrings = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
                body = node.body
                if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
                    docstrings.add(id(body[0].value))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
                yield path.relative_to(SRC), node.lineno, node.value


def test_the_scan_actually_sees_the_services_sql():
    texts = [t for _, _, t in sql_strings() if SQL.search(t)]
    assert any('"Document"' in t for t in texts) and any("outbox_events" in t for t in texts)


def test_no_sql_touches_foreign_tables():
    offenders = [(str(p), line) for p, line, text in sql_strings() if SQL.search(text) and FOREIGN.search(text)]
    assert offenders == []


def test_no_runtime_ddl_in_src():
    offenders = [(str(p), line) for p, line, text in sql_strings() if DDL.search(text)]
    assert offenders == []


def test_runtime_ddl_flag_and_old_pool_module_are_gone():
    assert not (SRC / "db_settings.py").exists()
    for path in SRC.rglob("*.py"):
        if any(part in path.parts for part in SKIP) or path.name == "test_no_foreign_tables.py":
            continue
        assert "AI_RUNTIME_DDL" not in path.read_text(encoding="utf-8"), path
