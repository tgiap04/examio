"""Keep document-derived text inside the DATA fence of GraphRAG prompts."""

from __future__ import annotations

import re

# "</document>", "< /DATA >", "<data>": any tag that could open or close a fence.
_FENCE_TAG = re.compile(r"<\s*/?\s*(?:document|data)\s*>", re.IGNORECASE)


def fence_safe(text: str | None) -> str:
    """Return ``text`` with fence tags removed, so it cannot close the fence it sits in."""
    return _FENCE_TAG.sub(" ", text or "")
