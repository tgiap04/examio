#!/usr/bin/env python3
"""Rename the Examio brand to KMAEdu across every git-tracked file.

Usage (from the repo root):
    python3 plans/261111-0007-rebrand-to-kmaedu/scripts/rebrand.py            # dry run
    python3 plans/261111-0007-rebrand-to-kmaedu/scripts/rebrand.py --apply

Only files listed by `git ls-files` are touched, so gitignored files (.env,
node_modules, venv) are never read. Binary files are skipped and reported.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

PLAN_DIR = "plans/261111-0007-rebrand-to-kmaedu/"
# Paths whose content keeps the old name on purpose (they record the rename).
CONTENT_EXCLUDES = (PLAN_DIR, "docs/project-changelog.md")

NEW_HOST = "kmaedu.fayedark.com"

# Ordered: specific rules first, the four case variants last.
RULES = [
    ("api-url", re.compile(r"https://api\.examio\.(?:vn|top)"), f"https://{NEW_HOST}"),
    ("api-host", re.compile(r"\bapi\.examio\.(?:vn|top)\b"), NEW_HOST),
    ("r2-host", re.compile(r"\br2\.examio\.com\b"), f"r2.{NEW_HOST}"),
    ("site-host", re.compile(r"\bexamio\.(?:vn|top)\b"), NEW_HOST),
    ("ghcr", re.compile(r"ghcr\.io/cychipo/examio"), "ghcr.io/tgiap04/kmaedu"),
    ("repo", re.compile(r"\b(?:cychipo|tgiap04)/examio\b"), "tgiap04/kmaedu"),
    ("EXAMIO", re.compile(r"EXAMIO"), "KMAEDU"),
    ("ExamIO", re.compile(r"ExamIO"), "KMAEdu"),
    ("Examio", re.compile(r"Examio"), "KMAEdu"),
    ("examio", re.compile(r"examio"), "kmaedu"),
]

PATH_RE = re.compile(r"examio", re.IGNORECASE)


def rename_text(text: str, counter: Counter | None = None) -> str:
    for name, pattern, repl in RULES:
        text, n = pattern.subn(repl, text)
        if counter is not None and n:
            counter[name] += n
    return text


def rename_path_part(part: str) -> str:
    return rename_text(part)


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True).stdout
    return [p for p in out.decode().split("\0") if p]


def is_binary(data: bytes) -> bool:
    return b"\0" in data[:8192]


def rewrite_contents(files: list[str], apply: bool) -> tuple[Counter, int, list[str]]:
    counter: Counter = Counter()
    changed = 0
    binaries: list[str] = []
    for path in files:
        if path.startswith(CONTENT_EXCLUDES):
            continue
        p = Path(path)
        if not p.is_file() or p.is_symlink():
            continue
        data = p.read_bytes()
        if not re.search(rb"(?i)examio", data):
            continue
        if is_binary(data):
            binaries.append(path)
            continue
        text = data.decode("utf-8")
        new = rename_text(text, counter)
        if new != text:
            changed += 1
            if apply:
                p.write_text(new, encoding="utf-8")
    return counter, changed, binaries


def path_moves(files: list[str]) -> list[tuple[str, str]]:
    """Directory and file moves, deepest first, so each git mv sees live paths."""
    targets: set[str] = set()
    for path in files:
        if path.startswith(PLAN_DIR):
            continue
        parts = path.split("/")
        for i, part in enumerate(parts):
            if PATH_RE.search(part):
                targets.add("/".join(parts[: i + 1]))
    moves = []
    for old in sorted(targets, key=lambda s: (-s.count("/"), s)):
        head, _, last = old.rpartition("/")
        new_last = rename_path_part(last)
        moves.append((old, f"{head}/{new_last}" if head else new_last))
    return moves


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    files = tracked_files()
    counter, changed, binaries = rewrite_contents(files, args.apply)
    moves = path_moves(files)

    print(f"mode: {'apply' if args.apply else 'dry-run'}")
    print(f"files with content changes: {changed}")
    for name, _, _ in RULES:
        print(f"  {name:8} {counter[name]}")
    print(f"path moves: {len(moves)}")
    for old, new in moves:
        if old.count("/") <= 1 or not args.apply:
            print(f"  {old} -> {new}")
    print(f"binary files still containing the old name: {len(binaries)}")
    for b in binaries:
        print(f"  {b}")

    if args.apply:
        for old, new in moves:
            if Path(old).exists():
                subprocess.run(["git", "mv", old, new], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
