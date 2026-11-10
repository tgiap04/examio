from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SandboxBackend = Literal['none', 'bubblewrap', 'nsjail']


class EvaluationSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix='EVAL_',
        env_file='.env',
        extra='ignore',
    )

    tutor_base_url: str = Field(
        default='http://127.0.0.1:8000/api/tutor',
        description='Base URL of ai-tutor-service endpoints',
    )
    request_timeout_seconds: int = Field(default=180)
    sample_limit: int = Field(default=10)
    pass_k: int = Field(default=1)
    runtime_root: Path = Field(default=Path('data-source/evaluation'))
    temp_root: Path = Field(default=Path('data-source/evaluation/tmp'))
    report_root: Path = Field(default=Path('data-source/evaluation/reports'))
    humaneval_path: Path = Field(
        default=Path('src/evaluation/datasets/samples/humaneval.jsonl')
    )
    mbpp_path: Path = Field(
        default=Path('src/evaluation/datasets/samples/mbpp.jsonl')
    )
    gcc_bin: str = Field(default='gcc')
    gpp_bin: str = Field(default='g++')
    python_bin: str = Field(default='python3')
    compile_timeout_seconds: int = Field(default=15)
    run_timeout_seconds: int = Field(default=15)

    # SECURITY: the sandbox executes untrusted/model-generated code. It is
    # disabled by default. When enabled with sandbox_backend='none', only
    # process-level mitigations apply (resource limits + a scrubbed env),
    # NOT real isolation -- see CODE_EXECUTION_SECURITY.md and
    # evaluation/sandbox/executor.py for the enforcement point.
    enable_code_execution: bool = Field(default=False)
    sandbox_cpu_seconds: int = Field(default=15)
    sandbox_memory_bytes: int = Field(default=512 * 1024 * 1024)
    sandbox_max_processes: int = Field(default=32)
    sandbox_max_file_size_bytes: int = Field(default=10 * 1024 * 1024)

    # OS-level isolation backend for the code executor, applied on top of the
    # rlimits/env-scrubbing above. 'none' keeps today's behavior unchanged
    # (no real isolation). 'bubblewrap'/'nsjail' wrap the child process with
    # the corresponding sandboxing tool (namespaces, no network, read-only
    # rootfs). If a backend is requested but its executable can't be found,
    # the executor fails closed and refuses to run the code unsandboxed.
    sandbox_backend: SandboxBackend = Field(default='none')
    # Optional explicit path to the bwrap/nsjail executable. When unset, the
    # executor looks it up on PATH via the backend's conventional binary
    # name (bwrap, nsjail).
    sandbox_wrapper_path: str | None = Field(default=None)


settings = EvaluationSettings()
