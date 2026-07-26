from datetime import date

from app.periodic_summary import (
    PeriodStats,
    build_notification,
    build_summary_input,
    build_summary_markdown,
    collect_stats,
    due_periods,
    months_between,
    previous_month,
    previous_week,
)
from tests.test_diary import MARKDOWN


def test_months_between_single_month():
    assert months_between(date(2026, 7, 1), date(2026, 7, 31)) == [(2026, 7)]


def test_months_between_spans_year_boundary():
    assert months_between(date(2025, 12, 29), date(2026, 1, 4)) == [(2025, 12), (2026, 1)]


def test_previous_week_is_the_completed_monday_to_sunday():
    # 2026-07-27 is a Monday; the completed week is 07-20 .. 07-26.
    period = previous_week(date(2026, 7, 27))
    assert (period.start, period.end) == (date(2026, 7, 20), date(2026, 7, 26))
    assert period.start.weekday() == 0
    assert period.end.weekday() == 6
    assert period.kind == "weekly"


def test_previous_week_from_midweek_still_uses_last_week():
    period = previous_week(date(2026, 7, 30))  # Thursday
    assert (period.start, period.end) == (date(2026, 7, 20), date(2026, 7, 26))


def test_previous_month_is_the_completed_calendar_month():
    period = previous_month(date(2026, 8, 1))
    assert (period.start, period.end) == (date(2026, 7, 1), date(2026, 7, 31))
    assert period.path == "summary/2026-07.md"
    assert period.label == "2026年7月"


def test_previous_month_crosses_year_boundary():
    period = previous_month(date(2026, 1, 1))
    assert (period.start, period.end) == (date(2025, 12, 1), date(2025, 12, 31))
    assert period.path == "summary/2025-12.md"


def test_previous_month_handles_february():
    period = previous_month(date(2026, 3, 1))
    assert period.end == date(2026, 2, 28)


def test_due_periods_on_a_plain_weekday_is_empty():
    assert due_periods(date(2026, 7, 29)) == []  # Wednesday, not the 1st


def test_due_periods_on_monday_returns_weekly():
    assert [p.kind for p in due_periods(date(2026, 7, 27))] == ["weekly"]


def test_due_periods_on_first_of_month_returns_monthly():
    assert [p.kind for p in due_periods(date(2026, 8, 1))] == ["monthly"]


def test_due_periods_when_monday_is_also_the_first():
    # 2026-06-01 is a Monday — both roll-ups are due.
    assert sorted(p.kind for p in due_periods(date(2026, 6, 1))) == ["monthly", "weekly"]


def test_collect_stats_counts_entries_days_and_images():
    stats = collect_stats([("2026-07-26", MARKDOWN), ("2026-07-27", MARKDOWN)])
    assert stats.day_count == 2
    assert stats.entry_count == 4
    assert stats.image_count == 4


def test_collect_stats_on_empty_period():
    stats = collect_stats([])
    assert (stats.day_count, stats.entry_count, stats.image_count) == (0, 0, 0)


def test_build_summary_input_prefixes_each_day():
    chunks = build_summary_input([("2026-07-26", MARKDOWN)])
    assert chunks[0].startswith("2026-07-26: ")
    assert "朝ランを5km走った" in chunks[0]


def test_build_summary_input_drops_whole_days_when_over_cap():
    days = [(f"2026-07-{d:02d}", MARKDOWN) for d in range(1, 11)]
    chunks = build_summary_input(days, max_chars=200)

    assert len(chunks) < len(days)
    assert "省略" in chunks[-1]
    # Kept days must remain whole, never cut mid-entry.
    assert all(c.startswith("2026-07-") for c in chunks[:-1])


def test_build_summary_input_skips_days_without_text():
    chunks = build_summary_input([("2026-07-26", "## 09:00\n\n- Discord投稿者: t\n")])
    assert chunks == []


def test_build_summary_markdown_includes_stats():
    period = previous_month(date(2026, 8, 1))
    markdown = build_summary_markdown(period, PeriodStats(12, 8, 3), "よく走った月。")

    assert "# 2026年7月 のまとめ" in markdown
    assert "- 記録した日数: 8日" in markdown
    assert "- 記録件数: 12件" in markdown
    assert "- 画像: 3枚" in markdown
    assert "よく走った月。" in markdown


def test_build_summary_markdown_includes_storage_usage_when_given():
    period = previous_month(date(2026, 8, 1))
    markdown = build_summary_markdown(period, PeriodStats(1, 1, 1), None, "10件 / 5.0 MB")
    assert "- 画像ストレージ使用量: 10件 / 5.0 MB" in markdown


def test_build_summary_markdown_notes_an_empty_period():
    period = previous_week(date(2026, 7, 27))
    markdown = build_summary_markdown(period, PeriodStats(0, 0, 0), None)
    assert "この期間の記録はありません" in markdown


def test_build_notification_includes_link():
    period = previous_month(date(2026, 8, 1))
    message = build_notification(period, PeriodStats(12, 8, 3), "https://github.com/x/y")
    assert "2026年7月" in message
    assert "8日 / 12件の記録" in message
    assert "https://github.com/x/y" in message


def test_build_notification_without_link():
    period = previous_week(date(2026, 7, 27))
    assert "None" not in build_notification(period, PeriodStats(1, 1, 0), None)
