from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class DocumentProcessingStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    DOCUMENT_PROCESSING_STATUS_UNSPECIFIED: _ClassVar[DocumentProcessingStatus]
    DOCUMENT_PROCESSING_STATUS_PENDING_CHARGE: _ClassVar[DocumentProcessingStatus]
    DOCUMENT_PROCESSING_STATUS_PENDING: _ClassVar[DocumentProcessingStatus]
    DOCUMENT_PROCESSING_STATUS_PROCESSING: _ClassVar[DocumentProcessingStatus]
    DOCUMENT_PROCESSING_STATUS_COMPLETED: _ClassVar[DocumentProcessingStatus]
    DOCUMENT_PROCESSING_STATUS_FAILED: _ClassVar[DocumentProcessingStatus]
DOCUMENT_PROCESSING_STATUS_UNSPECIFIED: DocumentProcessingStatus
DOCUMENT_PROCESSING_STATUS_PENDING_CHARGE: DocumentProcessingStatus
DOCUMENT_PROCESSING_STATUS_PENDING: DocumentProcessingStatus
DOCUMENT_PROCESSING_STATUS_PROCESSING: DocumentProcessingStatus
DOCUMENT_PROCESSING_STATUS_COMPLETED: DocumentProcessingStatus
DOCUMENT_PROCESSING_STATUS_FAILED: DocumentProcessingStatus

class DocumentInfo(_message.Message):
    __slots__ = ("id", "user_id", "filename", "mimetype", "size", "key_r2", "url", "processing_status", "credit_charged", "page_count", "created_at", "updated_at")
    ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    MIMETYPE_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    KEY_R2_FIELD_NUMBER: _ClassVar[int]
    URL_FIELD_NUMBER: _ClassVar[int]
    PROCESSING_STATUS_FIELD_NUMBER: _ClassVar[int]
    CREDIT_CHARGED_FIELD_NUMBER: _ClassVar[int]
    PAGE_COUNT_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    id: str
    user_id: str
    filename: str
    mimetype: str
    size: int
    key_r2: str
    url: str
    processing_status: DocumentProcessingStatus
    credit_charged: bool
    page_count: int
    created_at: int
    updated_at: int
    def __init__(self, id: _Optional[str] = ..., user_id: _Optional[str] = ..., filename: _Optional[str] = ..., mimetype: _Optional[str] = ..., size: _Optional[int] = ..., key_r2: _Optional[str] = ..., url: _Optional[str] = ..., processing_status: _Optional[_Union[DocumentProcessingStatus, str]] = ..., credit_charged: bool = ..., page_count: _Optional[int] = ..., created_at: _Optional[int] = ..., updated_at: _Optional[int] = ...) -> None: ...

class CreateUploadRequest(_message.Message):
    __slots__ = ("filename", "mimetype", "data", "charge_credits", "reuse_duplicate")
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    MIMETYPE_FIELD_NUMBER: _ClassVar[int]
    DATA_FIELD_NUMBER: _ClassVar[int]
    CHARGE_CREDITS_FIELD_NUMBER: _ClassVar[int]
    REUSE_DUPLICATE_FIELD_NUMBER: _ClassVar[int]
    filename: str
    mimetype: str
    data: bytes
    charge_credits: bool
    reuse_duplicate: bool
    def __init__(self, filename: _Optional[str] = ..., mimetype: _Optional[str] = ..., data: _Optional[bytes] = ..., charge_credits: bool = ..., reuse_duplicate: bool = ...) -> None: ...

class CreateUploadResponse(_message.Message):
    __slots__ = ("document", "reused")
    DOCUMENT_FIELD_NUMBER: _ClassVar[int]
    REUSED_FIELD_NUMBER: _ClassVar[int]
    document: DocumentInfo
    reused: bool
    def __init__(self, document: _Optional[_Union[DocumentInfo, _Mapping]] = ..., reused: bool = ...) -> None: ...

class GetDocumentsByIdsRequest(_message.Message):
    __slots__ = ("ids",)
    IDS_FIELD_NUMBER: _ClassVar[int]
    ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, ids: _Optional[_Iterable[str]] = ...) -> None: ...

class GetDocumentsByIdsResponse(_message.Message):
    __slots__ = ("documents",)
    DOCUMENTS_FIELD_NUMBER: _ClassVar[int]
    documents: _containers.RepeatedCompositeFieldContainer[DocumentInfo]
    def __init__(self, documents: _Optional[_Iterable[_Union[DocumentInfo, _Mapping]]] = ...) -> None: ...

class AssertOwnershipRequest(_message.Message):
    __slots__ = ("ids",)
    IDS_FIELD_NUMBER: _ClassVar[int]
    ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, ids: _Optional[_Iterable[str]] = ...) -> None: ...

class AssertOwnershipResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetQuotaRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetQuotaResponse(_message.Message):
    __slots__ = ("used_this_month", "monthly_limit", "file_count")
    USED_THIS_MONTH_FIELD_NUMBER: _ClassVar[int]
    MONTHLY_LIMIT_FIELD_NUMBER: _ClassVar[int]
    FILE_COUNT_FIELD_NUMBER: _ClassVar[int]
    used_this_month: int
    monthly_limit: int
    file_count: int
    def __init__(self, used_this_month: _Optional[int] = ..., monthly_limit: _Optional[int] = ..., file_count: _Optional[int] = ...) -> None: ...

class EnsureProcessedRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class EnsureProcessedResponse(_message.Message):
    __slots__ = ("document",)
    DOCUMENT_FIELD_NUMBER: _ClassVar[int]
    document: DocumentInfo
    def __init__(self, document: _Optional[_Union[DocumentInfo, _Mapping]] = ...) -> None: ...

class DeleteDocumentsRequest(_message.Message):
    __slots__ = ("ids",)
    IDS_FIELD_NUMBER: _ClassVar[int]
    ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, ids: _Optional[_Iterable[str]] = ...) -> None: ...

class DeletedDocument(_message.Message):
    __slots__ = ("id", "filename")
    ID_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    id: str
    filename: str
    def __init__(self, id: _Optional[str] = ..., filename: _Optional[str] = ...) -> None: ...

class DeleteDocumentsResponse(_message.Message):
    __slots__ = ("deleted", "not_found_ids")
    DELETED_FIELD_NUMBER: _ClassVar[int]
    NOT_FOUND_IDS_FIELD_NUMBER: _ClassVar[int]
    deleted: _containers.RepeatedCompositeFieldContainer[DeletedDocument]
    not_found_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, deleted: _Optional[_Iterable[_Union[DeletedDocument, _Mapping]]] = ..., not_found_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class ListDocumentsRequest(_message.Message):
    __slots__ = ("page", "size")
    PAGE_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    page: int
    size: int
    def __init__(self, page: _Optional[int] = ..., size: _Optional[int] = ...) -> None: ...

class ListDocumentsResponse(_message.Message):
    __slots__ = ("documents",)
    DOCUMENTS_FIELD_NUMBER: _ClassVar[int]
    documents: _containers.RepeatedCompositeFieldContainer[DocumentInfo]
    def __init__(self, documents: _Optional[_Iterable[_Union[DocumentInfo, _Mapping]]] = ...) -> None: ...

class GetDownloadUrlRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class GetDownloadUrlResponse(_message.Message):
    __slots__ = ("download_url", "expires_at")
    DOWNLOAD_URL_FIELD_NUMBER: _ClassVar[int]
    EXPIRES_AT_FIELD_NUMBER: _ClassVar[int]
    download_url: str
    expires_at: int
    def __init__(self, download_url: _Optional[str] = ..., expires_at: _Optional[int] = ...) -> None: ...
