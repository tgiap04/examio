from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GenerationOptions(_message.Message):
    __slots__ = ("num_items", "is_narrow_search", "keyword")
    NUM_ITEMS_FIELD_NUMBER: _ClassVar[int]
    IS_NARROW_SEARCH_FIELD_NUMBER: _ClassVar[int]
    KEYWORD_FIELD_NUMBER: _ClassVar[int]
    num_items: int
    is_narrow_search: bool
    keyword: str
    def __init__(self, num_items: _Optional[int] = ..., is_narrow_search: bool = ..., keyword: _Optional[str] = ...) -> None: ...

class ContentGenerationRequested(_message.Message):
    __slots__ = ("job_id", "user_id", "storage_id", "type", "options", "model", "download_url", "mimetype")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    STORAGE_ID_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    DOWNLOAD_URL_FIELD_NUMBER: _ClassVar[int]
    MIMETYPE_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    user_id: str
    storage_id: str
    type: str
    options: GenerationOptions
    model: str
    download_url: str
    mimetype: str
    def __init__(self, job_id: _Optional[str] = ..., user_id: _Optional[str] = ..., storage_id: _Optional[str] = ..., type: _Optional[str] = ..., options: _Optional[_Union[GenerationOptions, _Mapping]] = ..., model: _Optional[str] = ..., download_url: _Optional[str] = ..., mimetype: _Optional[str] = ...) -> None: ...
