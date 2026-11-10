from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

try:
    import resource
except ImportError:  # pragma: no cover - resource is POSIX-only (no Windows support)
    resource = None  # type: ignore[assignment]

from ..config.settings import settings
from .isolation import SandboxWrapper as _SandboxWrapper
from .isolation import build_sandboxed_command as _build_sandboxed_command
from .isolation import resolve_sandbox_wrapper_path as _resolve_sandbox_wrapper_path
from .isolation import sandbox_wrapper_binary_name as _sandbox_wrapper_binary_name
from .models import (
    SandboxExecutionRequest,
    SandboxExecutionResult,
)
from .utils import create_workdir, write_text

# SECURITY: this sandbox runs untrusted/model-generated code (and, for c/cpp,
# compiles it) via subprocess.run. The rlimits + scrubbed environment below
# are defense-in-depth, applied regardless of backend. Real isolation comes
# from settings.sandbox_backend ('bubblewrap' or 'nsjail', see
# .isolation); with the default backend 'none', there is NO OS-level
# isolation at all. See CODE_EXECUTION_SECURITY.md for the full threat
# model and deployment requirements before enabling code execution anywhere
# near production.
_SANDBOX_ENV_ALLOWLIST = ('PATH', 'HOME', 'LANG', 'LC_ALL')

logger = logging.getLogger(__name__)


def _scrubbed_subprocess_env() -> dict[str, str]:
    """Build a minimal environment for the sandboxed subprocess.

    Never inherit the full parent environment here: it carries secrets such
    as GEMINI_API_KEYS. Only the handful of variables needed to locate and
    run the interpreter/compiler are passed through.
    """
    scrubbed = {key: os.environ[key] for key in _SANDBOX_ENV_ALLOWLIST if key in os.environ}
    scrubbed.setdefault('PATH', '/usr/bin:/bin')
    return scrubbed


def _try_setrlimit(which: int, limit: tuple[int, int]) -> None:
    """Apply a single rlimit, swallowing failures.

    ``setrlimit`` is evaluated against the forked-but-not-yet-exec'd child,
    which still carries the parent's address space via copy-on-write. This
    service loads large ML/RAG libraries, so the parent's own RSS/VSZ can
    already exceed a conservative cap -- in that case the OS rejects the
    new limit outright. Failing one limit must not prevent the others (or
    the subprocess itself) from being applied/launched.
    """
    try:
        resource.setrlimit(which, limit)
    except (ValueError, OSError):
        pass


def _current_process_count() -> int | None:
    """Best-effort count of live processes owned by the current effective uid.

    RLIMIT_NPROC caps the *total* process count for a uid across the whole
    system/namespace, not just this subprocess's subtree -- so an absolute
    cap sized without regard to ambient load can (and, empirically, does)
    make legitimate multi-process toolchains (e.g. the c/cpp compiler
    chain) fail immediately. Returns ``None`` if the count can't be
    determined, so the caller can skip the NPROC cap rather than guess.
    """
    try:
        euid = str(os.geteuid())
    except AttributeError:  # pragma: no cover - POSIX only
        return None
    try:
        completed = subprocess.run(
            ['ps', '-e', '-o', 'uid='],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    return sum(1 for line in completed.stdout.splitlines() if line.strip() == euid)


def _resource_limit_preexec(max_new_processes: int | None):
    """Build a preexec_fn that caps CPU, memory, processes, and file size.

    Applied to the child process before exec, on POSIX only. This is a
    best-effort mitigation against runaway/resource-exhausting generated
    code, not a substitute for real sandboxing (see module-level SECURITY
    note above). ``max_new_processes`` is an absolute RLIMIT_NPROC value
    already sized relative to ambient process count (see
    ``_current_process_count``); pass ``None`` to skip the NPROC cap.
    """

    def _set_limits() -> None:
        _try_setrlimit(
            resource.RLIMIT_CPU,
            (settings.sandbox_cpu_seconds, settings.sandbox_cpu_seconds),
        )
        _try_setrlimit(
            resource.RLIMIT_AS,
            (settings.sandbox_memory_bytes, settings.sandbox_memory_bytes),
        )
        if max_new_processes is not None:
            _try_setrlimit(resource.RLIMIT_NPROC, (max_new_processes, max_new_processes))
        _try_setrlimit(
            resource.RLIMIT_FSIZE,
            (settings.sandbox_max_file_size_bytes, settings.sandbox_max_file_size_bytes),
        )

    return _set_limits


class ExecutionSandbox:
    def __init__(self, temp_root: Path | None = None) -> None:
        self.temp_root = temp_root or settings.temp_root

    def _adapt_cpp_source(self, source_code: str, entry_point: str | None, test_code: str) -> tuple[str, str]:
        adapted = source_code.strip()
        adapted_test_code = test_code
        if '#include <cassert>' not in adapted and '#include <assert.h>' not in adapted:
            adapted = '#include <cassert>\n' + adapted

        if entry_point and re.match(r'^\s*}\s*', adapted_test_code):
            adapted = adapted.rstrip()
            if adapted.endswith('}'):
                adapted_test_code = re.sub(r'^\s*}\s*', '', adapted_test_code, count=1)

        if entry_point and 'candidate(' in adapted_test_code and 'candidate(' not in adapted:
            alias_pattern = re.compile(rf'\b(auto|bool|int|long|float|double|char|std::[\w:<>]+|[A-Za-z_][\w:<>]*)\s+candidate\s*\(')
            signature_pattern = re.compile(
                rf'^[ \t]*(?P<return_type>[A-Za-z_][\w \t\*:&<>,]*)\s+{re.escape(entry_point)}\s*\((?P<params>[^\)]*)\)',
                re.MULTILINE,
            )
            signature_match = signature_pattern.search(adapted)
            if not alias_pattern.search(adapted) and signature_match:
                return_type = ' '.join(signature_match.group('return_type').split())
                params = signature_match.group('params').strip()
                arg_names: list[str] = []
                if params and params != 'void':
                    for raw_param in params.split(','):
                        param = raw_param.strip()
                        if not param:
                            continue
                        param = param.split('=')[0].strip()
                        pieces = re.findall(r'[A-Za-z_][A-Za-z0-9_]*', param)
                        if pieces:
                            arg_names.append(pieces[-1])
                candidate_params = params if params else 'void'
                candidate_args = ', '.join(arg_names)
                adapted += (
                    f'\n\n{return_type} candidate({candidate_params}) {{ '
                    f'return {entry_point}({candidate_args}); }}\n'
                )

        return adapted, adapted_test_code

    def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResult:
        if not settings.enable_code_execution:
            return SandboxExecutionResult(
                status='disabled',
                stdout='',
                stderr=(
                    'Code execution is disabled (set EVAL_ENABLE_CODE_EXECUTION=true '
                    'to enable it). Refusing to run untrusted generated code.'
                ),
                exit_code=None,
            )

        sandbox_wrapper, failure = self._resolve_sandbox_wrapper()
        if failure is not None:
            return failure

        if request.language == 'python':
            return self._execute_python(request, sandbox_wrapper)
        if request.language == 'c':
            return self._execute_c(request, sandbox_wrapper)
        if request.language == 'cpp':
            return self._execute_cpp(request, sandbox_wrapper)
        raise ValueError(f'Unsupported language: {request.language}')

    def _resolve_sandbox_wrapper(self) -> tuple[_SandboxWrapper, SandboxExecutionResult | None]:
        """Resolve the configured sandbox backend, failing closed if unavailable.

        Returns ``(wrapper, None)`` when execution may proceed (``wrapper``
        is ``None`` for backend ``'none'``), or ``(None, result)`` with a
        ``'disabled'`` result when a backend was requested but its
        executable could not be found -- in which case the caller MUST NOT
        fall back to running the command unsandboxed.
        """
        backend = settings.sandbox_backend
        if backend == 'none':
            logger.warning(
                "SECURITY: executing generated code with EVAL_SANDBOX_BACKEND='none' -- this "
                'provides NO OS-level isolation (no namespace, network, or filesystem '
                'restriction beyond process rlimits). This configuration must not be used in '
                'production; see CODE_EXECUTION_SECURITY.md.'
            )
            return None, None

        wrapper_path = _resolve_sandbox_wrapper_path(backend)
        if wrapper_path is None:
            binary_name = _sandbox_wrapper_binary_name(backend)
            logger.error(
                "Sandbox backend '%s' is configured (EVAL_SANDBOX_BACKEND) but the '%s' "
                'executable was not found on PATH or at EVAL_SANDBOX_WRAPPER_PATH. Refusing '
                'to execute untrusted code unsandboxed (fail-closed).',
                backend,
                binary_name,
            )
            return None, SandboxExecutionResult(
                status='disabled',
                stdout='',
                stderr=(
                    f"Sandbox backend '{backend}' is configured via EVAL_SANDBOX_BACKEND but "
                    f"the '{binary_name}' executable was not found. Install {binary_name}, set "
                    'EVAL_SANDBOX_WRAPPER_PATH to its location, or set '
                    'EVAL_SANDBOX_BACKEND=none. Refusing to run untrusted code without the '
                    'requested isolation (fail-closed).'
                ),
                exit_code=None,
            )
        return (backend, wrapper_path), None

    def _execute_python(
        self, request: SandboxExecutionRequest, sandbox_wrapper: _SandboxWrapper = None
    ) -> SandboxExecutionResult:
        workdir = create_workdir(self.temp_root, request.sample_id)
        main_path = write_text(workdir / 'solution.py', request.source_code)
        test_path = write_text(
            workdir / 'test_runner.py',
            f"from solution import *\n\n{request.test_code}\n",
        )
        return self._run_process(
            [settings.python_bin, str(test_path)],
            workdir=workdir,
            sandbox_wrapper=sandbox_wrapper,
        )

    def _execute_c(
        self, request: SandboxExecutionRequest, sandbox_wrapper: _SandboxWrapper = None
    ) -> SandboxExecutionResult:
        workdir = create_workdir(self.temp_root, request.sample_id)
        source_path = write_text(
            workdir / 'solution.c',
            f"{request.source_code}\n\n{request.test_code}\n",
        )
        binary_path = workdir / 'solution.out'

        compile_result = self._run_process(
            [settings.gcc_bin, str(source_path), '-O2', '-std=c11', '-o', str(binary_path)],
            workdir=workdir,
            timeout_seconds=settings.compile_timeout_seconds,
            sandbox_wrapper=sandbox_wrapper,
        )
        if compile_result.status != 'passed':
            compile_result.status = 'compile_error'
            return compile_result

        runtime_result = self._run_process(
            [str(binary_path)],
            workdir=workdir,
            timeout_seconds=settings.run_timeout_seconds,
            sandbox_wrapper=sandbox_wrapper,
        )
        runtime_result.binary_path = binary_path
        return runtime_result

    def _execute_cpp(
        self, request: SandboxExecutionRequest, sandbox_wrapper: _SandboxWrapper = None
    ) -> SandboxExecutionResult:
        workdir = create_workdir(self.temp_root, request.sample_id)
        adapted_source, adapted_test_code = self._adapt_cpp_source(
            request.source_code,
            request.entry_point,
            request.test_code,
        )
        source_path = write_text(
            workdir / 'solution.cpp',
            f"{adapted_source}\n\n{adapted_test_code}\n",
        )
        binary_path = workdir / 'solution.out'

        compile_result = self._run_process(
            [settings.gpp_bin, str(source_path), '-O2', '-std=c++17', '-o', str(binary_path)],
            workdir=workdir,
            timeout_seconds=settings.compile_timeout_seconds,
            sandbox_wrapper=sandbox_wrapper,
        )
        if compile_result.status != 'passed':
            compile_result.status = 'compile_error'
            return compile_result

        runtime_result = self._run_process(
            [str(binary_path)],
            workdir=workdir,
            timeout_seconds=settings.run_timeout_seconds,
            sandbox_wrapper=sandbox_wrapper,
        )
        runtime_result.binary_path = binary_path
        return runtime_result

    def cleanup(self, result: SandboxExecutionResult) -> None:
        if result.working_directory and result.working_directory.exists():
            shutil.rmtree(result.working_directory, ignore_errors=True)

    def _run_process(
        self,
        command: list[str],
        workdir: Path,
        timeout_seconds: int | None = None,
        sandbox_wrapper: _SandboxWrapper = None,
    ) -> SandboxExecutionResult:
        started_at = time.perf_counter()
        preexec_fn = None
        if resource is not None:
            current_processes = _current_process_count()
            max_new_processes = (
                current_processes + settings.sandbox_max_processes
                if current_processes is not None
                else None
            )
            # Applied inside the sandbox too (defense-in-depth): the wrapper
            # restricts namespaces/filesystem/network, rlimits still cap
            # CPU/memory/processes/file size for whatever runs inside it.
            preexec_fn = _resource_limit_preexec(max_new_processes)
        actual_command = _build_sandboxed_command(command, workdir, sandbox_wrapper)
        try:
            completed = subprocess.run(
                actual_command,
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=timeout_seconds or settings.run_timeout_seconds,
                check=False,
                env=_scrubbed_subprocess_env(),
                preexec_fn=preexec_fn,
            )
            duration_ms = (time.perf_counter() - started_at) * 1000
            status = 'passed' if completed.returncode == 0 else 'runtime_error'
            return SandboxExecutionResult(
                status=status,
                stdout=completed.stdout,
                stderr=completed.stderr,
                exit_code=completed.returncode,
                execution_time_ms=duration_ms,
                working_directory=workdir,
            )
        except FileNotFoundError as exc:
            duration_ms = (time.perf_counter() - started_at) * 1000
            return SandboxExecutionResult(
                status='runtime_error',
                stdout='',
                stderr=str(exc) or f'Executable not found: {command[0]}',
                exit_code=None,
                execution_time_ms=duration_ms,
                working_directory=workdir,
            )
        except PermissionError as exc:
            duration_ms = (time.perf_counter() - started_at) * 1000
            return SandboxExecutionResult(
                status='runtime_error',
                stdout='',
                stderr=str(exc) or f'Permission denied while running: {command[0]}',
                exit_code=None,
                execution_time_ms=duration_ms,
                working_directory=workdir,
            )
        except subprocess.TimeoutExpired as exc:
            duration_ms = (time.perf_counter() - started_at) * 1000
            return SandboxExecutionResult(
                status='timeout',
                stdout=exc.stdout or '',
                stderr=exc.stderr or '',
                exit_code=None,
                execution_time_ms=duration_ms,
                working_directory=workdir,
            )
