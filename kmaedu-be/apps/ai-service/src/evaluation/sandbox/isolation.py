"""OS-level sandbox wrapper builders for the untrusted code executor.

Pure command-building helpers, split out of ``executor.py`` so that file
stays focused on dispatch/process management. See
``../../CODE_EXECUTION_SECURITY.md`` for the full threat model and
deployment requirements around these backends.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from ..config.settings import settings

# (backend, resolved wrapper executable path) -- None means "no wrapping".
SandboxWrapper = tuple[str, str] | None

_SANDBOX_WRAPPER_BINARY = {
    'bubblewrap': 'bwrap',
    'nsjail': 'nsjail',
}

# Directories always worth exposing read-only inside the sandbox so the
# interpreter/compiler's shared libraries, headers, and standard tooling
# resolve normally. Missing entries (e.g. no /lib64 on some distros) are
# skipped rather than failing the bind.
_SANDBOX_STATIC_RO_BINDS = ('/usr', '/lib', '/lib64', '/lib32', '/bin', '/sbin', '/etc')


def sandbox_wrapper_binary_name(backend: str) -> str:
    """Return the conventional executable name for a sandbox backend."""
    return _SANDBOX_WRAPPER_BINARY[backend]


def resolve_sandbox_wrapper_path(backend: str) -> str | None:
    """Locate the wrapper executable for ``backend``, or ``None`` if unavailable.

    Honors ``settings.sandbox_wrapper_path`` when explicitly configured
    (must point at an executable file); otherwise falls back to a PATH
    lookup of the backend's conventional binary name.
    """
    if settings.sandbox_wrapper_path:
        configured = Path(settings.sandbox_wrapper_path)
        if configured.is_file() and os.access(configured, os.X_OK):
            return str(configured)
        return None
    return shutil.which(sandbox_wrapper_binary_name(backend))


def _extra_ro_binds_for_command(command: list[str]) -> list[tuple[str, str]]:
    """Resolve extra read-only bind mounts so the target executable resolves.

    ``command[0]`` (the interpreter or compiler) may live outside the
    static bind set above -- most commonly a project virtualenv's
    ``python3``, which is often itself a symlink into a system Python
    install. Bind both the direct path's directory and its realpath's
    directory so both the venv shim and the interpreter it points to are
    reachable inside the sandbox.
    """
    binds: list[tuple[str, str]] = []
    seen: set[str] = set()
    resolved = shutil.which(command[0]) or command[0]
    for candidate in {resolved, os.path.realpath(resolved)}:
        directory = str(Path(candidate).parent)
        if directory in seen or directory in _SANDBOX_STATIC_RO_BINDS or not Path(directory).is_dir():
            continue
        seen.add(directory)
        binds.append((directory, directory))
    return binds


def _bubblewrap_command(command: list[str], workdir: Path, wrapper_path: str) -> list[str]:
    """Wrap ``command`` to run under bubblewrap with no network and a read-only rootfs.

    Unshares every namespace (including network), exposes the base OS as
    read-only, gives a fresh tmpfs at /tmp, and grants read-write access
    only to ``workdir`` -- where the generated code and its build
    artifacts live.
    """
    workdir_str = str(workdir)
    args = [wrapper_path, '--unshare-all', '--die-with-parent']
    for path in _SANDBOX_STATIC_RO_BINDS:
        if Path(path).is_dir():
            args.extend(['--ro-bind', path, path])
    for directory, mount_point in _extra_ro_binds_for_command(command):
        args.extend(['--ro-bind', directory, mount_point])
    args.extend(['--proc', '/proc'])
    args.extend(['--dev', '/dev'])
    args.extend(['--tmpfs', '/tmp'])
    args.extend(['--bind', workdir_str, workdir_str])
    args.extend(['--chdir', workdir_str])
    args.append('--')
    args.extend(command)
    return args


def _nsjail_command(command: list[str], workdir: Path, wrapper_path: str) -> list[str]:
    """Wrap ``command`` to run under nsjail with no network and a scoped filesystem.

    ``-Mo`` runs a single command then exits; ``--disable_proc`` and
    ``--iface_no_lo`` keep it network- and /proc-isolated. Flags here are a
    starting template -- validate them against the target kernel/nsjail
    version before relying on this backend in production (see
    ``CODE_EXECUTION_SECURITY.md``).
    """
    workdir_str = str(workdir)
    args = [
        wrapper_path,
        '-Mo',
        '--disable_proc',
        '--iface_no_lo',
        '--chroot', '/',
        '--cwd', workdir_str,
        '--bindmount', f'{workdir_str}:{workdir_str}',
    ]
    for directory, mount_point in _extra_ro_binds_for_command(command):
        args.extend(['--bindmount_ro', f'{directory}:{mount_point}'])
    args.append('--')
    args.extend(command)
    return args


def build_sandboxed_command(command: list[str], workdir: Path, sandbox_wrapper: SandboxWrapper) -> list[str]:
    """Dispatch to the wrapper builder for the configured backend."""
    if sandbox_wrapper is None:
        return command
    backend, wrapper_path = sandbox_wrapper
    if backend == 'bubblewrap':
        return _bubblewrap_command(command, workdir, wrapper_path)
    if backend == 'nsjail':
        return _nsjail_command(command, workdir, wrapper_path)
    raise ValueError(f'Unknown sandbox backend: {backend}')  # pragma: no cover - guarded by settings enum
