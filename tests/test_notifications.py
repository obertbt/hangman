from datetime import datetime
from zoneinfo import ZoneInfo

from app.models import IssueSummary
from app.notifications import build_evening_message, build_morning_message

JST = ZoneInfo("Asia/Tokyo")
DT = datetime(2026, 7, 27, 4, 0, tzinfo=JST)


def _issue(number: int) -> IssueSummary:
    return IssueSummary(
        number=number,
        title=f"タスク{number}",
        url=f"https://github.com/owner/repo/issues/{number}",
    )


def test_build_morning_message_without_issues():
    message = build_morning_message(DT, [])
    assert "2026-07-27" in message
    assert "未完了のタスクはありません" in message


def test_build_morning_message_lists_issues():
    message = build_morning_message(DT, [_issue(1), _issue(2)])
    assert "未完了のタスクが2件あります" in message
    assert "- #1 タスク1" in message
    assert "https://github.com/owner/repo/issues/2" in message


def test_build_morning_message_states_lower_bound_when_capped():
    message = build_morning_message(DT, [_issue(1), _issue(2)], has_more=True)
    assert "未完了のタスクが2件以上あります" in message


def test_build_morning_message_states_exact_count_when_not_capped():
    message = build_morning_message(DT, [_issue(1)], has_more=False)
    assert "未完了のタスクが1件あります" in message
    assert "以上" not in message


def test_build_evening_message_with_entries():
    message = build_evening_message(DT, 3)
    assert "2026-07-27" in message
    assert "今日は3件の記録がありました" in message


def test_build_evening_message_without_entries():
    message = build_evening_message(DT, 0)
    assert "まだ今日の記録がありません" in message
