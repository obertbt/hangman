"""Message text for the scheduled morning and evening notifications.

Pure formatting only: fetching the data and posting to Discord live in
github_service and discord_handler respectively, so these builders stay
trivially testable.
"""
from __future__ import annotations

from datetime import datetime

from app.models import IssueSummary

MAX_LISTED_ISSUES = 10


def build_morning_message(
    dt: datetime, issues: list[IssueSummary], has_more: bool = False
) -> str:
    """Morning digest of open tasks.

    `has_more` means the list was capped, so the count is stated as a
    lower bound rather than an exact — and possibly wrong — number.
    """
    header = f"☀️ おはようございます（{dt:%Y-%m-%d}）"
    if not issues:
        return f"{header}\n未完了のタスクはありません。"

    count_text = f"{len(issues)}件以上" if has_more else f"{len(issues)}件"
    lines = [header, f"未完了のタスクが{count_text}あります。", ""]
    for issue in issues:
        lines.append(f"- #{issue.number} {issue.title}")
        lines.append(f"  {issue.url}")
    return "\n".join(lines)


def build_evening_message(
    dt: datetime, entry_count: int, summary: str | None = None
) -> str:
    header = f"🌙 今日のライフログ（{dt:%Y-%m-%d}）"
    if entry_count == 0:
        return (
            f"{header}\n"
            "まだ今日の記録がありません。ひとことだけでも残しておきませんか？"
        )
    message = f"{header}\n今日は{entry_count}件の記録がありました。おつかれさまでした。"
    if summary:
        message += f"\n\n📝 今日のまとめ\n{summary}"
    return message
