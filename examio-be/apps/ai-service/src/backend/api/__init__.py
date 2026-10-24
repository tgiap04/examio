"""HTTP routers: only the ``AI_HTTP_COMPAT`` routes remain (see ``chat.py``)."""

from .chat import router

__all__ = ["router"]
