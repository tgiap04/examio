"""Errors that steer the consumer's retry / dead-letter decision."""


class PermanentEventError(Exception):
    """Retrying can never succeed: the message goes straight to ``<svc>.dlq``."""

    def __init__(self, code: str, message: str | None = None) -> None:
        """Create the error with a stable ``code`` used in logs."""
        super().__init__(message or code)
        self.code = code
