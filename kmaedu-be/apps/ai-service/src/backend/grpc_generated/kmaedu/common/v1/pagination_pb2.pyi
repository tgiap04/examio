from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class PageMeta(_message.Message):
    __slots__ = ("total", "page", "limit")
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    LIMIT_FIELD_NUMBER: _ClassVar[int]
    total: int
    page: int
    limit: int
    def __init__(self, total: _Optional[int] = ..., page: _Optional[int] = ..., limit: _Optional[int] = ...) -> None: ...
