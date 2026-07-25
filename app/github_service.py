"""Saves lifelog entries as Markdown into a GitHub repository."""
from __future__ import annotations

import time
from datetime import datetime

from github import Auth, Github, GithubException, UnknownObjectException

from app.config import Config
from app.models import MarkdownEntryData

MAX_RETRIES = 3
INITIAL_BACKOFF_SECONDS = 1.0


class GitHubSaveError(Exception):
    """Raised when saving an entry to GitHub ultimately fails."""


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
    if entry.r2_keys:
        lines.append("- 添付ファイル:")
        for key in entry.r2_keys:
            lines.append(f"  - `{key}`")
    return "\n".join(lines) + "\n"


def build_commit_message(dt: datetime, time_str: str) -> str:
    return f"Add Discord log for {dt:%Y-%m-%d} {time_str}"


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
