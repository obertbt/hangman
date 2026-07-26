"""Refuses to start a second bot on the same machine.

Two bots sharing one Discord token both answer every post and both write
to GitHub. The symptoms are confusing rather than obvious — replies that
stop, logs that disagree with each other — so a stray second copy tends
to survive several rounds of diagnosis before anyone spots it. Stopping
the scheduled task is exactly how one gets orphaned: the task kills the
launcher, and the python process it started keeps running.

The lock is held by the operating system for as long as the process is
alive, so a crash leaves nothing stale to clean up.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

DEFAULT_LOCK_PATH = "data/bot.lock"


class AlreadyRunningError(Exception):
    """Raised when another bot already holds the lock."""


if sys.platform == "win32":
    import msvcrt

    def _take(handle) -> None:
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)

else:
    import fcntl

    def _take(handle) -> None:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def acquire_lock(path: str = DEFAULT_LOCK_PATH):
    """Claim the single-instance lock, or raise AlreadyRunningError.

    Returns the open file handle. Keep a reference to it for the life of
    the process: closing it releases the lock.
    """
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    handle = open(path, "a+")
    try:
        _take(handle)
    except OSError as exc:
        handle.close()
        raise AlreadyRunningError(
            f"Botは既に起動しています（ロックファイル: {path}）。"
            "二重起動すると、1回の投稿がGitHubへ2回保存されます。"
            "実行中のBotを停止してから起動し直してください。"
        ) from exc

    handle.seek(0)
    handle.truncate()
    handle.write(f"{os.getpid()}\n")
    handle.flush()
    return handle
