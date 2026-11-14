from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ChatMessage(_message.Message):
    __slots__ = ("role", "content")
    ROLE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    role: str
    content: str
    def __init__(self, role: _Optional[str] = ..., content: _Optional[str] = ...) -> None: ...

class StreamChatRequest(_message.Message):
    __slots__ = ("query", "history", "user_storage_id", "department", "model_type", "system_prompt")
    QUERY_FIELD_NUMBER: _ClassVar[int]
    HISTORY_FIELD_NUMBER: _ClassVar[int]
    USER_STORAGE_ID_FIELD_NUMBER: _ClassVar[int]
    DEPARTMENT_FIELD_NUMBER: _ClassVar[int]
    MODEL_TYPE_FIELD_NUMBER: _ClassVar[int]
    SYSTEM_PROMPT_FIELD_NUMBER: _ClassVar[int]
    query: str
    history: _containers.RepeatedCompositeFieldContainer[ChatMessage]
    user_storage_id: str
    department: str
    model_type: str
    system_prompt: str
    def __init__(self, query: _Optional[str] = ..., history: _Optional[_Iterable[_Union[ChatMessage, _Mapping]]] = ..., user_storage_id: _Optional[str] = ..., department: _Optional[str] = ..., model_type: _Optional[str] = ..., system_prompt: _Optional[str] = ...) -> None: ...

class QueryRequest(_message.Message):
    __slots__ = ("query", "history", "user_storage_id", "department", "model_type", "system_prompt")
    QUERY_FIELD_NUMBER: _ClassVar[int]
    HISTORY_FIELD_NUMBER: _ClassVar[int]
    USER_STORAGE_ID_FIELD_NUMBER: _ClassVar[int]
    DEPARTMENT_FIELD_NUMBER: _ClassVar[int]
    MODEL_TYPE_FIELD_NUMBER: _ClassVar[int]
    SYSTEM_PROMPT_FIELD_NUMBER: _ClassVar[int]
    query: str
    history: _containers.RepeatedCompositeFieldContainer[ChatMessage]
    user_storage_id: str
    department: str
    model_type: str
    system_prompt: str
    def __init__(self, query: _Optional[str] = ..., history: _Optional[_Iterable[_Union[ChatMessage, _Mapping]]] = ..., user_storage_id: _Optional[str] = ..., department: _Optional[str] = ..., model_type: _Optional[str] = ..., system_prompt: _Optional[str] = ...) -> None: ...

class ChatSource(_message.Message):
    __slots__ = ("content", "page", "title", "chunk_id")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    CHUNK_ID_FIELD_NUMBER: _ClassVar[int]
    content: str
    page: str
    title: str
    chunk_id: str
    def __init__(self, content: _Optional[str] = ..., page: _Optional[str] = ..., title: _Optional[str] = ..., chunk_id: _Optional[str] = ...) -> None: ...

class QueryResponse(_message.Message):
    __slots__ = ("answer", "sources", "timestamp")
    ANSWER_FIELD_NUMBER: _ClassVar[int]
    SOURCES_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    answer: str
    sources: _containers.RepeatedCompositeFieldContainer[ChatSource]
    timestamp: int
    def __init__(self, answer: _Optional[str] = ..., sources: _Optional[_Iterable[_Union[ChatSource, _Mapping]]] = ..., timestamp: _Optional[int] = ...) -> None: ...

class StreamChatResponse(_message.Message):
    __slots__ = ("started", "chunk", "done", "error")
    STARTED_FIELD_NUMBER: _ClassVar[int]
    CHUNK_FIELD_NUMBER: _ClassVar[int]
    DONE_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    started: StreamStarted
    chunk: str
    done: StreamDone
    error: StreamError
    def __init__(self, started: _Optional[_Union[StreamStarted, _Mapping]] = ..., chunk: _Optional[str] = ..., done: _Optional[_Union[StreamDone, _Mapping]] = ..., error: _Optional[_Union[StreamError, _Mapping]] = ...) -> None: ...

class StreamStarted(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class StreamDone(_message.Message):
    __slots__ = ("assistant_message", "created_at", "sources")
    ASSISTANT_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    SOURCES_FIELD_NUMBER: _ClassVar[int]
    assistant_message: ChatMessage
    created_at: int
    sources: _containers.RepeatedCompositeFieldContainer[ChatSource]
    def __init__(self, assistant_message: _Optional[_Union[ChatMessage, _Mapping]] = ..., created_at: _Optional[int] = ..., sources: _Optional[_Iterable[_Union[ChatSource, _Mapping]]] = ...) -> None: ...

class StreamError(_message.Message):
    __slots__ = ("message", "code")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    CODE_FIELD_NUMBER: _ClassVar[int]
    message: str
    code: str
    def __init__(self, message: _Optional[str] = ..., code: _Optional[str] = ...) -> None: ...

class GenerateWordFamilyRequest(_message.Message):
    __slots__ = ("category_slug", "category_name", "num_root_words", "exclude_root_words", "root_word", "model_type")
    CATEGORY_SLUG_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_NAME_FIELD_NUMBER: _ClassVar[int]
    NUM_ROOT_WORDS_FIELD_NUMBER: _ClassVar[int]
    EXCLUDE_ROOT_WORDS_FIELD_NUMBER: _ClassVar[int]
    ROOT_WORD_FIELD_NUMBER: _ClassVar[int]
    MODEL_TYPE_FIELD_NUMBER: _ClassVar[int]
    category_slug: str
    category_name: str
    num_root_words: int
    exclude_root_words: _containers.RepeatedScalarFieldContainer[str]
    root_word: str
    model_type: str
    def __init__(self, category_slug: _Optional[str] = ..., category_name: _Optional[str] = ..., num_root_words: _Optional[int] = ..., exclude_root_words: _Optional[_Iterable[str]] = ..., root_word: _Optional[str] = ..., model_type: _Optional[str] = ...) -> None: ...

class WordAffix(_message.Message):
    __slots__ = ("prefix", "root", "suffix")
    PREFIX_FIELD_NUMBER: _ClassVar[int]
    ROOT_FIELD_NUMBER: _ClassVar[int]
    SUFFIX_FIELD_NUMBER: _ClassVar[int]
    prefix: str
    root: str
    suffix: str
    def __init__(self, prefix: _Optional[str] = ..., root: _Optional[str] = ..., suffix: _Optional[str] = ...) -> None: ...

class WordFamilyWord(_message.Message):
    __slots__ = ("word", "pos", "meaning_en", "meaning_vi", "example", "affix")
    WORD_FIELD_NUMBER: _ClassVar[int]
    POS_FIELD_NUMBER: _ClassVar[int]
    MEANING_EN_FIELD_NUMBER: _ClassVar[int]
    MEANING_VI_FIELD_NUMBER: _ClassVar[int]
    EXAMPLE_FIELD_NUMBER: _ClassVar[int]
    AFFIX_FIELD_NUMBER: _ClassVar[int]
    word: str
    pos: str
    meaning_en: str
    meaning_vi: str
    example: str
    affix: WordAffix
    def __init__(self, word: _Optional[str] = ..., pos: _Optional[str] = ..., meaning_en: _Optional[str] = ..., meaning_vi: _Optional[str] = ..., example: _Optional[str] = ..., affix: _Optional[_Union[WordAffix, _Mapping]] = ...) -> None: ...

class WordFamilyData(_message.Message):
    __slots__ = ("root_word", "category_slug", "words")
    ROOT_WORD_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_SLUG_FIELD_NUMBER: _ClassVar[int]
    WORDS_FIELD_NUMBER: _ClassVar[int]
    root_word: str
    category_slug: str
    words: _containers.RepeatedCompositeFieldContainer[WordFamilyWord]
    def __init__(self, root_word: _Optional[str] = ..., category_slug: _Optional[str] = ..., words: _Optional[_Iterable[_Union[WordFamilyWord, _Mapping]]] = ...) -> None: ...

class GenerateWordFamilyResponse(_message.Message):
    __slots__ = ("data",)
    DATA_FIELD_NUMBER: _ClassVar[int]
    data: WordFamilyData
    def __init__(self, data: _Optional[_Union[WordFamilyData, _Mapping]] = ...) -> None: ...

class ListModelsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ModelSpec(_message.Message):
    __slots__ = ("label", "value")
    LABEL_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    label: str
    value: str
    def __init__(self, label: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...

class ModelInfo(_message.Message):
    __slots__ = ("id", "name", "description", "provider", "runtime_model_name", "badge", "disabled", "is_default", "supports_structured_output", "specs", "available", "availability_reason")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    PROVIDER_FIELD_NUMBER: _ClassVar[int]
    RUNTIME_MODEL_NAME_FIELD_NUMBER: _ClassVar[int]
    BADGE_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    IS_DEFAULT_FIELD_NUMBER: _ClassVar[int]
    SUPPORTS_STRUCTURED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    SPECS_FIELD_NUMBER: _ClassVar[int]
    AVAILABLE_FIELD_NUMBER: _ClassVar[int]
    AVAILABILITY_REASON_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    description: str
    provider: str
    runtime_model_name: str
    badge: str
    disabled: bool
    is_default: bool
    supports_structured_output: bool
    specs: _containers.RepeatedCompositeFieldContainer[ModelSpec]
    available: bool
    availability_reason: str
    def __init__(self, id: _Optional[str] = ..., name: _Optional[str] = ..., description: _Optional[str] = ..., provider: _Optional[str] = ..., runtime_model_name: _Optional[str] = ..., badge: _Optional[str] = ..., disabled: bool = ..., is_default: bool = ..., supports_structured_output: bool = ..., specs: _Optional[_Iterable[_Union[ModelSpec, _Mapping]]] = ..., available: bool = ..., availability_reason: _Optional[str] = ...) -> None: ...

class ListModelsResponse(_message.Message):
    __slots__ = ("embedding_model", "generation_models", "default_generation_model")
    EMBEDDING_MODEL_FIELD_NUMBER: _ClassVar[int]
    GENERATION_MODELS_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_GENERATION_MODEL_FIELD_NUMBER: _ClassVar[int]
    embedding_model: ModelInfo
    generation_models: _containers.RepeatedCompositeFieldContainer[ModelInfo]
    default_generation_model: str
    def __init__(self, embedding_model: _Optional[_Union[ModelInfo, _Mapping]] = ..., generation_models: _Optional[_Iterable[_Union[ModelInfo, _Mapping]]] = ..., default_generation_model: _Optional[str] = ...) -> None: ...
