import os

import pytest

from app.single_instance import AlreadyRunningError, acquire_lock


def test_acquire_lock_writes_the_pid(tmp_path):
    path = str(tmp_path / "bot.lock")
    handle = acquire_lock(path)
    try:
        assert (tmp_path / "bot.lock").read_text().strip() == str(os.getpid())
    finally:
        handle.close()


def test_acquire_lock_creates_missing_directories(tmp_path):
    handle = acquire_lock(str(tmp_path / "data" / "bot.lock"))
    handle.close()
    assert (tmp_path / "data" / "bot.lock").exists()


def test_second_acquire_is_refused(tmp_path):
    """Two bots on one token both answer every post and both write to GitHub."""
    path = str(tmp_path / "bot.lock")
    handle = acquire_lock(path)
    try:
        with pytest.raises(AlreadyRunningError):
            acquire_lock(path)
    finally:
        handle.close()


def test_lock_is_reusable_once_released(tmp_path):
    """A crashed bot must not leave the lock stuck: the OS releases it."""
    path = str(tmp_path / "bot.lock")
    acquire_lock(path).close()

    handle = acquire_lock(path)
    handle.close()


def test_refusal_names_the_lock_file(tmp_path):
    path = str(tmp_path / "bot.lock")
    handle = acquire_lock(path)
    try:
        with pytest.raises(AlreadyRunningError, match="bot.lock"):
            acquire_lock(path)
    finally:
        handle.close()
