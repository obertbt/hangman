"""Saves lifelog entries as Markdown, and tasks as Issues, in a GitHub repo."""
from __future__ import annotations

import re
import time
from datetime import date, datetime

from github import Auth, Github, GithubException, UnknownObjectException

from app.config import Config
from app.diary import entry_bodies
from app.models import CreatedIssue, IssueSummary, MarkdownEntryData, TaskData
from app.periodic_summary import months_between
from app.tagging import format_tags

MAX_RETRIES = 3
INITIAL_BACKOFF_SECONDS = 1.0
MAX_ISSUE_TITLE_LENGTH = 120

_ENTRY_HEADING_RE = re.compile(r"^## \d{2}:\d{2}\s*$", re.MULTILINE)

TAG_LINE_PREFIX = "- タグ:"


def count_entry_headings(markdown: str) -> int:
    """Number of `## HH:MM` entries in a daily Markdown file."""
    return len(_ENTRY_HEADING_RE.findall(markdown))


def extract_entry_bodies(markdown: str) -> list[str]:
    """The text the user actually wrote, one string per entry.

    Metadata bullets (author, IDs, timestamps, R2 keys) are dropped so a
    summarizer sees the diary content rather than bookkeeping noise.
    """
    return entry_bodies(markdown)


class GitHubSaveError(Exception):
    """Raised when saving an entry to GitHub ultimately fails."""


class GitHubIssueError(Exception):
    """Raised when creating a GitHub Issue fails."""


def build_daily_path(dt: datetime) -> str:
    """daily/YYYY/MM/YYYY-MM-DD.md for the given (JST) datetime."""
    return f"daily/{dt:%Y}/{dt:%m}/{dt:%Y-%m-%d}.md"


def build_entry_markdown(entry: MarkdownEntryData) -> str:
    lines = [
        f"## {entry.time_str}",
        "",
        entry.content,
        "",
        f"- Discord投稿者: {entry.author_name}",
        f"- DiscordユーザーID: {entry.author_id}",
        f"- DiscordメッセージID: {entry.message_id}",
        f"- Discord投稿日時: {entry.iso_datetime}",
    ]
    # Must stay inside the metadata block (after 投稿者) so the parser
    # does not mistake it for diary text.
    if entry.weather:
        lines.append(f"- 天気: {entry.weather}")
    if entry.r2_keys:
        lines.append("- 添付ファイル:")
        for key in entry.r2_keys:
            lines.append(f"  - `{key}`")
    return "\n".join(lines) + "\n"


def build_commit_message(dt: datetime, time_str: str) -> str:
    return f"Add Discord log for {dt:%Y-%m-%d} {time_str}"


def insert_tag_line(markdown: str, message_id: int, tags: list[str]) -> str | None:
    """Add a `- タグ:` line to the entry with this Discord message ID.

    Returns None when there is nothing to do — the entry is not in this
    file, or it already carries tags — so the caller can skip the commit.
    """
    if not tags:
        return None

    target = f"- DiscordメッセージID: {message_id}"
    lines = markdown.splitlines()
    for index, line in enumerate(lines):
        if line.strip() != target:
            continue
        # Walk the rest of this entry: a tag line already there means a
        # retry or a hand edit, and must not be duplicated.
        for following in lines[index + 1 :]:
            if following.startswith("## "):
                break
            if following.startswith(TAG_LINE_PREFIX):
                return None
        lines.insert(index + 1, f"{TAG_LINE_PREFIX} {format_tags(tags)}")
        return "\n".join(lines) + "\n"
    return None


def build_issue_title(task_text: str) -> str:
    """First line of the task, trimmed to a sane Issue title length."""
    first_line = task_text.strip().splitlines()[0].strip()
    if len(first_line) > MAX_ISSUE_TITLE_LENGTH:
        return first_line[: MAX_ISSUE_TITLE_LENGTH - 1] + "…"
    return first_line


def build_issue_body(task: TaskData) -> str:
    lines: list[str] = []
    remainder = "\n".join(task.text.strip().splitlines()[1:]).strip()
    if remainder:
        lines.extend([remainder, ""])
    lines.extend(
        [
            f"- Discord投稿者: {task.author_name}",
            f"- DiscordユーザーID: {task.author_id}",
            f"- DiscordメッセージID: {task.message_id}",
            f"- Discord投稿日時: {task.iso_datetime}",
        ]
    )
    return "\n".join(lines) + "\n"


class GitHubService:
    def __init__(self, config: Config, *, sleep_func=time.sleep):
        self._config = config
        self._github = Github(auth=Auth.Token(config.github_token))
        self._sleep_func = sleep_func

    def _repo(self):
        return self._github.get_repo(f"{self._config.github_owner}/{self._config.github_repo}")

    def save_entry(self, dt: datetime, entry: MarkdownEntryData) -> str:
        """Create or append the entry to the daily Markdown file.

        Retries with exponential backoff on 409 conflicts (concurrent
        writers racing on the same file's SHA).
        """
        path = build_daily_path(dt)
        entry_markdown = build_entry_markdown(entry)
        commit_message = build_commit_message(dt, entry.time_str)
        branch = self._config.github_branch
        repo = self._repo()

        attempt = 0
        while True:
            try:
                try:
                    existing = repo.get_contents(path, ref=branch)
                    existing_text = existing.decoded_content.decode("utf-8")
                    new_content = existing_text.rstrip("\n") + "\n\n" + entry_markdown
                    repo.update_file(
                        path,
                        commit_message,
                        new_content,
                        existing.sha,
                        branch=branch,
                    )
                except UnknownObjectException:
                    repo.create_file(path, commit_message, entry_markdown, branch=branch)
                return path
            except GithubException as exc:
                attempt += 1
                if exc.status == 409 and attempt < MAX_RETRIES:
                    self._sleep_func(INITIAL_BACKOFF_SECONDS * (2 ** (attempt - 1)))
                    continue
                raise GitHubSaveError(f"GitHubへの保存に失敗しました: {exc}") from exc

    def add_tags_to_entry(self, dt: datetime, message_id: int, tags: list[str]) -> bool:
        """Add tags to an entry that is already saved.

        Tagging waits on an LLM, so it runs after the entry is safely in
        the repository rather than in front of it. Returns whether the
        file actually changed.
        """
        path = build_daily_path(dt)
        branch = self._config.github_branch
        repo = self._repo()

        attempt = 0
        while True:
            try:
                existing = repo.get_contents(path, ref=branch)
                updated = insert_tag_line(
                    existing.decoded_content.decode("utf-8"), message_id, tags
                )
                if updated is None:
                    return False
                repo.update_file(
                    path,
                    f"Add tags for {dt:%Y-%m-%d} {dt:%H:%M}",
                    updated,
                    existing.sha,
                    branch=branch,
                )
                return True
            except UnknownObjectException:
                return False
            except GithubException as exc:
                attempt += 1
                if exc.status == 409 and attempt < MAX_RETRIES:
                    self._sleep_func(INITIAL_BACKOFF_SECONDS * (2 ** (attempt - 1)))
                    continue
                raise GitHubSaveError(f"タグの保存に失敗しました: {exc}") from exc

    def create_issue(self, task: TaskData) -> CreatedIssue:
        title = build_issue_title(task.text)
        body = build_issue_body(task)
        try:
            issue = self._repo().create_issue(title=title, body=body)
        except GithubException as exc:
            if exc.status in (403, 404):
                raise GitHubIssueError(
                    "GitHub Issueの作成に失敗しました。トークンに Issues: Read and write "
                    f"権限があるか確認してください: {exc}"
                ) from exc
            raise GitHubIssueError(f"GitHub Issueの作成に失敗しました: {exc}") from exc
        return CreatedIssue(number=issue.number, url=issue.html_url)

    def list_dates_in_month(self, year: int, month: int) -> list[str]:
        """`YYYY-MM-DD` strings for days that have a diary file, newest first."""
        path = f"daily/{year:04d}/{month:02d}"
        try:
            contents = self._repo().get_contents(path, ref=self._config.github_branch)
        except UnknownObjectException:
            return []
        except GithubException as exc:
            raise GitHubSaveError(f"日記一覧の取得に失敗しました: {exc}") from exc
        if not isinstance(contents, list):
            contents = [contents]
        dates = [item.name[:-3] for item in contents if item.name.endswith(".md")]
        return sorted(dates, reverse=True)

    def fetch_entries_in_range(self, start: date, end: date) -> list[tuple[str, str]]:
        """(YYYY-MM-DD, markdown) for days with entries, oldest first.

        Lists each month the range touches and fetches only the days that
        exist, rather than probing every date in the range.
        """
        results: list[tuple[str, str]] = []
        for year, month in months_between(start, end):
            for date_str in sorted(self.list_dates_in_month(year, month)):
                try:
                    day = datetime.strptime(date_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                if not (start <= day <= end):
                    continue
                markdown = self.fetch_daily_markdown(datetime(day.year, day.month, day.day))
                if markdown:
                    results.append((date_str, markdown))
        return results

    def save_summary(self, path: str, content: str, commit_message: str) -> None:
        """Create the summary file, or replace it if a run already wrote one."""
        repo = self._repo()
        branch = self._config.github_branch
        try:
            try:
                existing = repo.get_contents(path, ref=branch)
                repo.update_file(path, commit_message, content, existing.sha, branch=branch)
            except UnknownObjectException:
                repo.create_file(path, commit_message, content, branch=branch)
        except GithubException as exc:
            raise GitHubSaveError(f"まとめの保存に失敗しました: {exc}") from exc

    def list_open_issues(self, limit: int) -> list[IssueSummary]:
        """Open Issues, newest first. Pull requests are excluded."""
        try:
            issues = self._repo().get_issues(state="open", sort="created", direction="desc")
            summaries: list[IssueSummary] = []
            for issue in issues:
                if issue.pull_request is not None:
                    continue
                summaries.append(
                    IssueSummary(number=issue.number, title=issue.title, url=issue.html_url)
                )
                if len(summaries) >= limit:
                    break
            return summaries
        except GithubException as exc:
            raise GitHubIssueError(f"GitHub Issueの取得に失敗しました: {exc}") from exc

    def fetch_daily_markdown(self, dt: datetime) -> str | None:
        """The given (JST) date's diary file, or None when nothing exists yet."""
        try:
            contents = self._repo().get_contents(
                build_daily_path(dt), ref=self._config.github_branch
            )
        except UnknownObjectException:
            return None
        except GithubException as exc:
            raise GitHubSaveError(f"日記ファイルの取得に失敗しました: {exc}") from exc
        return contents.decoded_content.decode("utf-8")

    def count_entries_for_date(self, dt: datetime) -> int:
        """How many lifelog entries the given (JST) date's file holds.

        A missing file simply means nothing was recorded yet.
        """
        markdown = self.fetch_daily_markdown(dt)
        return count_entry_headings(markdown) if markdown else 0
