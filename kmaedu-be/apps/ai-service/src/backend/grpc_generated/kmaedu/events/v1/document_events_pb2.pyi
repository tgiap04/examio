from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class DocumentUploaded(_message.Message):
    __slots__ = ("storage_id", "user_id", "filename", "mimetype", "download_url")
    STORAGE_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    MIMETYPE_FIELD_NUMBER: _ClassVar[int]
    DOWNLOAD_URL_FIELD_NUMBER: _ClassVar[int]
    storage_id: str
    user_id: str
    filename: str
    mimetype: str
    download_url: str
    def __init__(self, storage_id: _Optional[str] = ..., user_id: _Optional[str] = ..., filename: _Optional[str] = ..., mimetype: _Optional[str] = ..., download_url: _Optional[str] = ...) -> None: ...

class DocumentDeleted(_message.Message):
    __slots__ = ("storage_ids", "user_id")
    STORAGE_IDS_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    storage_ids: _containers.RepeatedScalarFieldContainer[str]
    user_id: str
    def __init__(self, storage_ids: _Optional[_Iterable[str]] = ..., user_id: _Optional[str] = ...) -> None: ...
