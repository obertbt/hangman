from datetime import datetime
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest
from github import GithubException, UnknownObjectException

from app.github_service import (
    GitHubSaveError,
    GitHubService,
    build_commit_message,
    build_daily_path,
    build_entry_markdown,
)
from app.models import MarkdownEntryData

JST = ZoneInfo("Asia/Tokyo")


def _make_entry(**overrides) -> MarkdownEntryData:
    defaults = dict(
        time_str="21:35",
        content="今日はホッケーの練習。",
        author_name="tomoya",
        author_id=999,
        message_id=123456789,
        iso_datetime="2026-07-19T21:35:00+09:00",
        r2_keys=[],
    )
    defaults.update(overrides)
    return MarkdownEntryData(**defaults)


def test_build_daily_path_uses_jst_date():
    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    assert build_daily_path(dt) == "daily/2026/07/2026-07-19.md"


def test_build_commit_message_format():
    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    assert build_commit_message(dt, "21:35") == "Add Discord log for 2026-07-19 21:35"


def test_build_entry_markdown_without_attachments():
    entry = _make_entry(r2_keys=[])
    md = build_entry_markdown(entry)
    assert md.startswith("## 21:35\n\n今日はホッケーの練習。\n\n")
    assert "- Discord投稿者: tomoya" in md
    assert "- DiscordユーザーID: 999" in md
    assert "- DiscordメッセージID: 123456789" in md
    assert "- Discord投稿日時: 2026-07-19T21:35:00+09:00" in md
    assert "添付ファイル" not in md


def test_build_entry_markdown_with_attachments():
    entry = _make_entry(r2_keys=["images/2026/07/19/123456789-photo.jpg"])
    md = build_entry_markdown(entry)
    assert "- 添付ファイル:" in md
    assert "  - `images/2026/07/19/123456789-photo.jpg`" in md


class FakeContentFile:
    def __init__(self, text: str, sha: str = "abc123"):
        self.decoded_content = text.encode("utf-8")
        self.sha = sha


def _service_with_repo(repo):
    config = MagicMock()
    config.github_token = "ghp_dummy"
    config.github_owner = "owner"
    config.github_repo = "hearth-life"
    config.github_branch = "main"
    service = GitHubService(config, sleep_func=lambda _: None)
    service._github = MagicMock()
    service._github.get_repo.return_value = repo
    return service


def test_save_entry_creates_new_file_when_missing():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    service = _service_with_repo(repo)

    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    path = service.save_entry(dt, _make_entry())

    assert path == "daily/2026/07/2026-07-19.md"
    repo.create_file.assert_called_once()
    args, kwargs = repo.create_file.call_args
    assert args[0] == "daily/2026/07/2026-07-19.md"
    assert args[1] == "Add Discord log for 2026-07-19 21:35"
    assert "今日はホッケーの練習。" in args[2]
    assert kwargs["branch"] == "main"
    repo.update_file.assert_not_called()


def test_save_entry_appends_to_existing_file():
    existing_text = "## 09:00\n\n昨日の記録\n\n- Discord投稿者: tomoya\n"
    repo = MagicMock()
    repo.get_contents.return_value = FakeContentFile(existing_text, sha="sha-1")
    service = _service_with_repo(repo)

    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    service.save_entry(dt, _make_entry())

    repo.update_file.assert_called_once()
    args, kwargs = repo.update_file.call_args
    assert args[0] == "daily/2026/07/2026-07-19.md"
    assert existing_text.strip() in args[2]
    assert "今日はホッケーの練習。" in args[2]
    assert args[3] == "sha-1"
    assert kwargs["branch"] == "main"
    repo.create_file.assert_not_called()


def test_save_entry_retries_on_409_then_succeeds():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    repo.create_file.side_effect = [
        GithubException(409, {"message": "conflict"}),
        GithubException(409, {"message": "conflict"}),
        None,
    ]
    service = _service_with_repo(repo)

    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    service.save_entry(dt, _make_entry())

    assert repo.create_file.call_count == 3


def test_save_entry_raises_after_max_retries():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    repo.create_file.side_effect = GithubException(409, {"message": "conflict"})
    service = _service_with_repo(repo)

    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    with pytest.raises(GitHubSaveError):
        service.save_entry(dt, _make_entry())

    assert repo.create_file.call_count == 3


def test_save_entry_raises_immediately_on_non_conflict_error():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    repo.create_file.side_effect = GithubException(403, {"message": "forbidden"})
    service = _service_with_repo(repo)

    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    with pytest.raises(GitHubSaveError):
        service.save_entry(dt, _make_entry())

    assert repo.create_file.call_count == 1
