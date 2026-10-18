from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class UploadFileRequest(_message.Message):
    __slots__ = ("user_id", "filename", "mimetype", "content", "folder")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    MIMETYPE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    FOLDER_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    filename: str
    mimetype: str
    content: bytes
    folder: str
    def __init__(self, user_id: _Optional[str] = ..., filename: _Optional[str] = ..., mimetype: _Optional[str] = ..., content: _Optional[bytes] = ..., folder: _Optional[str] = ...) -> None: ...

class UploadFileResponse(_message.Message):
    __slots__ = ("success", "file_id", "url", "key_r2", "message")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    FILE_ID_FIELD_NUMBER: _ClassVar[int]
    URL_FIELD_NUMBER: _ClassVar[int]
    KEY_R2_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    success: bool
    file_id: str
    url: str
    key_r2: str
    message: str
    def __init__(self, success: bool = ..., file_id: _Optional[str] = ..., url: _Optional[str] = ..., key_r2: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...

class GetFileUrlRequest(_message.Message):
    __slots__ = ("key_r2", "expires_in_seconds")
    KEY_R2_FIELD_NUMBER: _ClassVar[int]
    EXPIRES_IN_SECONDS_FIELD_NUMBER: _ClassVar[int]
    key_r2: str
    expires_in_seconds: int
    def __init__(self, key_r2: _Optional[str] = ..., expires_in_seconds: _Optional[int] = ...) -> None: ...

class GetFileUrlResponse(_message.Message):
    __slots__ = ("url", "expires_at")
    URL_FIELD_NUMBER: _ClassVar[int]
    EXPIRES_AT_FIELD_NUMBER: _ClassVar[int]
    url: str
    expires_at: int
    def __init__(self, url: _Optional[str] = ..., expires_at: _Optional[int] = ...) -> None: ...

class DeleteFileRequest(_message.Message):
    __slots__ = ("key_r2",)
    KEY_R2_FIELD_NUMBER: _ClassVar[int]
    key_r2: str
    def __init__(self, key_r2: _Optional[str] = ...) -> None: ...

class DeleteFileResponse(_message.Message):
    __slots__ = ("success", "message")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    success: bool
    message: str
    def __init__(self, success: bool = ..., message: _Optional[str] = ...) -> None: ...

class ListUserFilesRequest(_message.Message):
    __slots__ = ("user_id", "page", "size")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    page: int
    size: int
    def __init__(self, user_id: _Optional[str] = ..., page: _Optional[int] = ..., size: _Optional[int] = ...) -> None: ...

class FileInfo(_message.Message):
    __slots__ = ("file_id", "filename", "url", "mimetype", "size", "created_at")
    FILE_ID_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    URL_FIELD_NUMBER: _ClassVar[int]
    MIMETYPE_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    file_id: str
    filename: str
    url: str
    mimetype: str
    size: int
    created_at: int
    def __init__(self, file_id: _Optional[str] = ..., filename: _Optional[str] = ..., url: _Optional[str] = ..., mimetype: _Optional[str] = ..., size: _Optional[int] = ..., created_at: _Optional[int] = ...) -> None: ...

class ListUserFilesResponse(_message.Message):
    __slots__ = ("files", "total", "page", "size")
    FILES_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    files: _containers.RepeatedCompositeFieldContainer[FileInfo]
    total: int
    page: int
    size: int
    def __init__(self, files: _Optional[_Iterable[_Union[FileInfo, _Mapping]]] = ..., total: _Optional[int] = ..., page: _Optional[int] = ..., size: _Optional[int] = ...) -> None: ...

class DeleteObjectsRequest(_message.Message):
    __slots__ = ("keys",)
    KEYS_FIELD_NUMBER: _ClassVar[int]
    keys: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, keys: _Optional[_Iterable[str]] = ...) -> None: ...

class DeleteObjectsResponse(_message.Message):
    __slots__ = ("deleted_count",)
    DELETED_COUNT_FIELD_NUMBER: _ClassVar[int]
    deleted_count: int
    def __init__(self, deleted_count: _Optional[int] = ...) -> None: ...
