from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AiDocumentProcessed(_message.Message):
    __slots__ = ("storage_id", "page_count")
    STORAGE_ID_FIELD_NUMBER: _ClassVar[int]
    PAGE_COUNT_FIELD_NUMBER: _ClassVar[int]
    storage_id: str
    page_count: int
    def __init__(self, storage_id: _Optional[str] = ..., page_count: _Optional[int] = ...) -> None: ...

class AiDocumentFailed(_message.Message):
    __slots__ = ("storage_id", "reason")
    STORAGE_ID_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    storage_id: str
    reason: str
    def __init__(self, storage_id: _Optional[str] = ..., reason: _Optional[str] = ...) -> None: ...

class GeneratedQuizItem(_message.Message):
    __slots__ = ("question", "options", "answer", "source_page_range")
    QUESTION_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    ANSWER_FIELD_NUMBER: _ClassVar[int]
    SOURCE_PAGE_RANGE_FIELD_NUMBER: _ClassVar[int]
    question: str
    options: _containers.RepeatedScalarFieldContainer[str]
    answer: str
    source_page_range: str
    def __init__(self, question: _Optional[str] = ..., options: _Optional[_Iterable[str]] = ..., answer: _Optional[str] = ..., source_page_range: _Optional[str] = ...) -> None: ...

class GeneratedFlashcardItem(_message.Message):
    __slots__ = ("question", "answer", "source_page_range")
    QUESTION_FIELD_NUMBER: _ClassVar[int]
    ANSWER_FIELD_NUMBER: _ClassVar[int]
    SOURCE_PAGE_RANGE_FIELD_NUMBER: _ClassVar[int]
    question: str
    answer: str
    source_page_range: str
    def __init__(self, question: _Optional[str] = ..., answer: _Optional[str] = ..., source_page_range: _Optional[str] = ...) -> None: ...

class GeneratedItems(_message.Message):
    __slots__ = ("quizzes", "flashcards")
    QUIZZES_FIELD_NUMBER: _ClassVar[int]
    FLASHCARDS_FIELD_NUMBER: _ClassVar[int]
    quizzes: _containers.RepeatedCompositeFieldContainer[GeneratedQuizItem]
    flashcards: _containers.RepeatedCompositeFieldContainer[GeneratedFlashcardItem]
    def __init__(self, quizzes: _Optional[_Iterable[_Union[GeneratedQuizItem, _Mapping]]] = ..., flashcards: _Optional[_Iterable[_Union[GeneratedFlashcardItem, _Mapping]]] = ...) -> None: ...

class AiGenerationCompleted(_message.Message):
    __slots__ = ("job_id", "type", "items")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    ITEMS_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    type: str
    items: GeneratedItems
    def __init__(self, job_id: _Optional[str] = ..., type: _Optional[str] = ..., items: _Optional[_Union[GeneratedItems, _Mapping]] = ...) -> None: ...

class AiGenerationFailed(_message.Message):
    __slots__ = ("job_id", "reason")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    reason: str
    def __init__(self, job_id: _Optional[str] = ..., reason: _Optional[str] = ...) -> None: ...
