"""Pick local or global search for a question with a keyword heuristic.

Matching is case- and diacritic-insensitive, on word starts, so "Tổng quan", "tong quan"
and "TỔNG QUAN" all hit. A bare "tóm" is not enough: only the overview phrases below count.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Literal

SearchMode = Literal["local", "global"]

# Written folded (no diacritics, lowercase); matched at a word start.
_GLOBAL_PATTERNS = (
    r"tong quan",
    r"tom tat",
    r"noi dung chinh",
    r"y chinh",
    r"cac chu de",
    r"tai lieu (?:nay )?noi ve",
    r"overview",
    r"summar",  # summary, summarize, summarise
    r"main (?:idea|point|topic)s?",
)
_GLOBAL = re.compile(r"\b(?:" + "|".join(_GLOBAL_PATTERNS) + ")")


def fold(text: str) -> str:
    """Lowercase ``text`` and strip diacritics (``đ`` becomes ``d``)."""
    decomposed = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def classify(query: str) -> SearchMode:
    """Return ``'global'`` for whole-document questions, ``'local'`` for everything else."""
    return "global" if _GLOBAL.search(fold(query)) else "local"
