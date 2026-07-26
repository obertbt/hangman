from datetime import datetime
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest
from github import GithubException, UnknownObjectException

from app.github_service import (
    MAX_ISSUE_TITLE_LENGTH,
    GitHubIssueError,
    GitHubSaveError,
    GitHubService,
    build_commit_message,
    build_daily_path,
    build_entry_markdown,
    build_issue_body,
    build_issue_title,
    count_entry_headings,
)
from app.models import MarkdownEntryData, TaskData

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


def _make_task(**overrides) -> TaskData:
    defaults = dict(
        text="牛乳を買う",
        author_name="tomoya",
        author_id=999,
        message_id=123456789,
        iso_datetime="2026-07-19T21:35:00+09:00",
    )
    defaults.update(overrides)
    return TaskData(**defaults)


def test_build_issue_title_uses_first_line():
    assert build_issue_title("牛乳を買う\n詳細メモ") == "牛乳を買う"


def test_build_issue_title_truncates_long_text():
    title = build_issue_title("あ" * 300)
    assert len(title) == MAX_ISSUE_TITLE_LENGTH
    assert title.endswith("…")


def test_build_issue_body_includes_metadata_without_first_line():
    body = build_issue_body(_make_task(text="牛乳を買う\n低脂肪のもの"))
    assert "低脂肪のもの" in body
    assert "牛乳を買う" not in body  # 1行目はタイトルに使われるため本文には含めない
    assert "- Discord投稿者: tomoya" in body
    assert "- DiscordメッセージID: 123456789" in body


def test_build_issue_body_for_single_line_task():
    body = build_issue_body(_make_task(text="牛乳を買う"))
    assert body.startswith("- Discord投稿者:")
    assert "- Discord投稿日時: 2026-07-19T21:35:00+09:00" in body


def test_create_issue_returns_number_and_url():
    repo = MagicMock()
    repo.create_issue.return_value = MagicMock(
        number=42, html_url="https://github.com/owner/hearth-life/issues/42"
    )
    service = _service_with_repo(repo)

    issue = service.create_issue(_make_task(text="牛乳を買う\n低脂肪のもの"))

    assert issue.number == 42
    assert issue.url == "https://github.com/owner/hearth-life/issues/42"
    _, kwargs = repo.create_issue.call_args
    assert kwargs["title"] == "牛乳を買う"
    assert "低脂肪のもの" in kwargs["body"]


def test_create_issue_raises_with_permission_hint_on_403():
    repo = MagicMock()
    repo.create_issue.side_effect = GithubException(403, {"message": "forbidden"})
    service = _service_with_repo(repo)

    with pytest.raises(GitHubIssueError, match="Issues: Read and write"):
        service.create_issue(_make_task())


def test_create_issue_raises_on_other_errors():
    repo = MagicMock()
    repo.create_issue.side_effect = GithubException(500, {"message": "server error"})
    service = _service_with_repo(repo)

    with pytest.raises(GitHubIssueError):
        service.create_issue(_make_task())


def test_count_entry_headings_counts_time_headings():
    markdown = (
        "## 09:00\n\n朝の記録\n\n- Discord投稿者: tomoya\n\n"
        "## 21:35\n\n夜の記録\n\n- Discord投稿者: tomoya\n"
    )
    assert count_entry_headings(markdown) == 2


def test_count_entry_headings_ignores_other_headings():
    markdown = "# 見出し\n\n## メモ\n\n## 9:00\n\n## 09:00\n"
    assert count_entry_headings(markdown) == 1


def test_count_entries_for_date_returns_zero_when_file_missing():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    service = _service_with_repo(repo)
    assert service.count_entries_for_date(datetime(2026, 7, 27, tzinfo=JST)) == 0


def test_count_entries_for_date_counts_existing_entries():
    repo = MagicMock()
    repo.get_contents.return_value = FakeContentFile("## 09:00\n\nあ\n\n## 21:35\n\nい\n")
    service = _service_with_repo(repo)
    assert service.count_entries_for_date(datetime(2026, 7, 27, tzinfo=JST)) == 2


def test_list_open_issues_excludes_pull_requests_and_respects_limit():
    repo = MagicMock()
    repo.get_issues.return_value = [
        MagicMock(number=3, title="タスクA", html_url="u3", pull_request=None),
        MagicMock(number=2, title="PR", html_url="u2", pull_request=object()),
        MagicMock(number=1, title="タスクB", html_url="u1", pull_request=None),
    ]
    service = _service_with_repo(repo)

    issues = service.list_open_issues(limit=10)

    assert [i.number for i in issues] == [3, 1]
    assert issues[0].title == "タスクA"
    repo.get_issues.assert_called_once_with(state="open", sort="created", direction="desc")


def test_list_open_issues_stops_at_limit():
    repo = MagicMock()
    repo.get_issues.return_value = [
        MagicMock(number=n, title=f"t{n}", html_url=f"u{n}", pull_request=None)
        for n in range(10)
    ]
    service = _service_with_repo(repo)
    assert len(service.list_open_issues(limit=3)) == 3


def test_list_open_issues_wraps_api_errors():
    repo = MagicMock()
    repo.get_issues.side_effect = GithubException(403, {"message": "forbidden"})
    service = _service_with_repo(repo)
    with pytest.raises(GitHubIssueError):
        service.list_open_issues(limit=5)
