from datetime import date, datetime
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
    extract_entry_bodies,
    insert_tag_line,
)
from app.diary import parse_daily_markdown
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


ENTRY_MARKDOWN = """## 09:00

朝ランを5km走った

- Discord投稿者: tomoya
- DiscordユーザーID: 999
- DiscordメッセージID: 1
- Discord投稿日時: 2026-07-26T09:00:00+09:00

## 21:35

夕方に買い物へ行った
牛乳と卵を買った

- Discord投稿者: tomoya
- DiscordユーザーID: 999
- DiscordメッセージID: 2
- Discord投稿日時: 2026-07-26T21:35:00+09:00
- 添付ファイル:
  - `images/2026/07/26/2-photo.jpg`
"""


def test_extract_entry_bodies_returns_only_user_text():
    bodies = extract_entry_bodies(ENTRY_MARKDOWN)
    assert bodies == ["朝ランを5km走った", "夕方に買い物へ行った\n牛乳と卵を買った"]


def test_extract_entry_bodies_excludes_metadata_and_r2_keys():
    joined = "\n".join(extract_entry_bodies(ENTRY_MARKDOWN))
    assert "Discord投稿者" not in joined
    assert "images/2026" not in joined
    assert "DiscordメッセージID" not in joined


def test_extract_entry_bodies_skips_entries_without_text():
    markdown = "## 09:00\n\n- Discord投稿者: tomoya\n"
    assert extract_entry_bodies(markdown) == []


def test_extract_entry_bodies_handles_empty_file():
    assert extract_entry_bodies("") == []


def test_fetch_daily_markdown_returns_none_when_missing():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    service = _service_with_repo(repo)
    assert service.fetch_daily_markdown(datetime(2026, 7, 26, tzinfo=JST)) is None


def test_fetch_daily_markdown_returns_text():
    repo = MagicMock()
    repo.get_contents.return_value = FakeContentFile(ENTRY_MARKDOWN)
    service = _service_with_repo(repo)
    assert service.fetch_daily_markdown(datetime(2026, 7, 26, tzinfo=JST)) == ENTRY_MARKDOWN


class FakeDirEntry:
    def __init__(self, name: str):
        self.name = name


def _repo_with_tree(tree: dict[str, list[str]]):
    """A repo whose get_contents serves month listings and day files from `tree`."""
    repo = MagicMock()

    def get_contents(path, ref=None):
        if path in tree:
            return [FakeDirEntry(name) for name in tree[path]]
        month_dir, _, filename = path.rpartition("/")
        if filename in tree.get(month_dir, []):
            return FakeContentFile(f"## 09:00\n\n{filename} の記録\n")
        raise UnknownObjectException(404, {"message": "Not Found"})

    repo.get_contents.side_effect = get_contents
    return repo


def test_fetch_entries_in_range_spans_months_and_sorts_oldest_first():
    repo = _repo_with_tree(
        {
            "daily/2026/06": ["2026-06-27.md", "2026-06-29.md"],
            "daily/2026/07": ["2026-07-03.md", "2026-07-09.md"],
        }
    )
    service = _service_with_repo(repo)

    entries = service.fetch_entries_in_range(date(2026, 6, 28), date(2026, 7, 5))

    assert [date_str for date_str, _ in entries] == ["2026-06-29", "2026-07-03"]
    assert "2026-06-29.md の記録" in entries[0][1]


def test_fetch_entries_in_range_skips_months_without_a_directory():
    repo = _repo_with_tree({"daily/2026/07": ["2026-07-03.md"]})
    service = _service_with_repo(repo)

    entries = service.fetch_entries_in_range(date(2026, 6, 1), date(2026, 7, 31))

    assert [date_str for date_str, _ in entries] == ["2026-07-03"]


def test_fetch_entries_in_range_ignores_files_that_are_not_dates():
    repo = _repo_with_tree({"daily/2026/07": ["README.md", "2026-07-03.md"]})
    service = _service_with_repo(repo)

    entries = service.fetch_entries_in_range(date(2026, 7, 1), date(2026, 7, 31))

    assert [date_str for date_str, _ in entries] == ["2026-07-03"]


def test_save_summary_creates_file_when_missing():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    service = _service_with_repo(repo)

    service.save_summary("summary/2026-07.md", "# 2026年7月", "Add monthly summary")

    repo.create_file.assert_called_once_with(
        "summary/2026-07.md", "Add monthly summary", "# 2026年7月", branch="main"
    )
    repo.update_file.assert_not_called()


def test_save_summary_replaces_an_existing_file():
    repo = MagicMock()
    repo.get_contents.return_value = FakeContentFile("古いまとめ", sha="sha-9")
    service = _service_with_repo(repo)

    service.save_summary("summary/2026-07.md", "# 2026年7月", "Add monthly summary")

    repo.update_file.assert_called_once_with(
        "summary/2026-07.md", "Add monthly summary", "# 2026年7月", "sha-9", branch="main"
    )
    repo.create_file.assert_not_called()


def test_save_summary_raises_friendly_error_on_github_failure():
    repo = MagicMock()
    repo.get_contents.side_effect = GithubException(500, {"message": "boom"})
    service = _service_with_repo(repo)

    with pytest.raises(GitHubSaveError):
        service.save_summary("summary/2026-07.md", "# 2026年7月", "Add monthly summary")


TAGGABLE = """## 09:00

朝ラン5km

- Discord投稿者: tomoya
- DiscordメッセージID: 111
- Discord投稿日時: 2026-07-26T09:00:00+09:00

## 20:00

買い物

- Discord投稿者: tomoya
- DiscordメッセージID: 222
- Discord投稿日時: 2026-07-26T20:00:00+09:00
"""


def test_insert_tag_line_targets_the_right_entry():
    updated = insert_tag_line(TAGGABLE, 222, ["買い物"])
    entries = parse_daily_markdown(updated)
    assert entries[0].tags == []
    assert entries[1].tags == ["買い物"]


def test_insert_tag_line_keeps_the_body_intact():
    """A tag must never be mistaken for diary text."""
    entry = parse_daily_markdown(insert_tag_line(TAGGABLE, 111, ["運動"]))[0]
    assert entry.body == "朝ラン5km"


def test_insert_tag_line_ignores_an_entry_that_is_already_tagged():
    once = insert_tag_line(TAGGABLE, 111, ["運動"])
    assert insert_tag_line(once, 111, ["健康"]) is None


def test_insert_tag_line_ignores_an_unknown_message():
    assert insert_tag_line(TAGGABLE, 999, ["運動"]) is None


def test_insert_tag_line_ignores_an_empty_tag_list():
    assert insert_tag_line(TAGGABLE, 111, []) is None


def test_add_tags_to_entry_commits_the_updated_file():
    repo = MagicMock()
    repo.get_contents.return_value = FakeContentFile(TAGGABLE, sha="sha-3")
    service = _service_with_repo(repo)

    changed = service.add_tags_to_entry(datetime(2026, 7, 26, 9, 0, tzinfo=JST), 111, ["運動"])

    assert changed is True
    args, kwargs = repo.update_file.call_args
    assert args[0] == "daily/2026/07/2026-07-26.md"
    assert args[1] == "Add tags for 2026-07-26 09:00"
    assert "- タグ: #運動" in args[2]
    assert args[3] == "sha-3"
    assert kwargs["branch"] == "main"


def test_add_tags_to_entry_skips_the_commit_when_nothing_changes():
    repo = MagicMock()
    repo.get_contents.return_value = FakeContentFile(TAGGABLE, sha="sha-3")
    service = _service_with_repo(repo)

    assert service.add_tags_to_entry(datetime(2026, 7, 26, tzinfo=JST), 999, ["運動"]) is False
    repo.update_file.assert_not_called()


def test_add_tags_to_entry_returns_false_when_the_day_is_missing():
    repo = MagicMock()
    repo.get_contents.side_effect = UnknownObjectException(404, {"message": "Not Found"})
    service = _service_with_repo(repo)

    assert service.add_tags_to_entry(datetime(2026, 7, 26, tzinfo=JST), 111, ["運動"]) is False


def test_add_tags_to_entry_retries_on_conflict():
    repo = MagicMock()
    repo.get_contents.return_value = FakeContentFile(TAGGABLE, sha="sha-3")
    repo.update_file.side_effect = [
        GithubException(409, {"message": "Conflict"}),
        None,
    ]
    service = _service_with_repo(repo)

    assert service.add_tags_to_entry(datetime(2026, 7, 26, tzinfo=JST), 111, ["運動"]) is True
    assert repo.update_file.call_count == 2
