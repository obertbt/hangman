"""Weekly and monthly roll-ups of the diary.

Runs over a *completed* period — last week on Monday, last month on the
1st — so a summary is never written from partial data and never needs
regenerating.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from app.diary import parse_daily_markdown

# Keeps a month of diary within reach of a small local model. Text beyond
# this is dropped with a visible note rather than silently truncated.
DEFAULT_MAX_INPUT_CHARS = 12000


@dataclass(frozen=True)
class Period:
    kind: str  # "weekly" or "monthly"
    start: date
    end: date
    label: str
    path: str


def months_between(start: date, end: date) -> list[tuple[int, int]]:
    """(year, month) pairs covering the range, inclusive."""
    months: list[tuple[int, int]] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def previous_week(today: date) -> Period:
    """The Monday–Sunday week before the one containing `today`."""
    this_monday = today - timedelta(days=today.weekday())
    start = this_monday - timedelta(days=7)
    end = start + timedelta(days=6)
    iso_year, iso_week, _ = start.isocalendar()
    label = f"{iso_year}年 第{iso_week}週（{start:%m/%d}〜{end:%m/%d}）"
    return Period("weekly", start, end, label, f"summary/{iso_year}-W{iso_week:02d}.md")


def previous_month(today: date) -> Period:
    """The calendar month before the one containing `today`."""
    first_of_this = today.replace(day=1)
    end = first_of_this - timedelta(days=1)
    start = end.replace(day=1)
    label = f"{start.year}年{start.month}月"
    return Period("monthly", start, end, label, f"summary/{start:%Y-%m}.md")


def due_periods(today: date) -> list[Period]:
    """Which roll-ups today triggers. Monday and the 1st can coincide."""
    periods: list[Period] = []
    if today.weekday() == calendar.MONDAY:
        periods.append(previous_week(today))
    if today.day == 1:
        periods.append(previous_month(today))
    return periods


@dataclass
class PeriodStats:
    entry_count: int
    day_count: int
    image_count: int


def collect_stats(entries_by_day: list[tuple[str, str]]) -> PeriodStats:
    entry_count = 0
    image_count = 0
    for _, markdown in entries_by_day:
        parsed = parse_daily_markdown(markdown)
        entry_count += len(parsed)
        image_count += sum(len(entry.image_keys) for entry in parsed)
    return PeriodStats(entry_count, len(entries_by_day), image_count)


def build_summary_input(
    entries_by_day: list[tuple[str, str]], max_chars: int = DEFAULT_MAX_INPUT_CHARS
) -> list[str]:
    """One string per day, capped so a small model can handle the whole period.

    Days are kept whole and dropped from the end, so the model always
    sees complete entries rather than a sentence cut mid-word.
    """
    chunks: list[str] = []
    used = 0
    for date_str, markdown in entries_by_day:
        bodies = [entry.body for entry in parse_daily_markdown(markdown) if entry.body]
        if not bodies:
            continue
        chunk = f"{date_str}: " + " / ".join(bodies)
        if used + len(chunk) > max_chars:
            chunks.append(f"（以降 {len(entries_by_day) - len(chunks)} 日分は長さの都合で省略）")
            break
        chunks.append(chunk)
        used += len(chunk)
    return chunks


def build_summary_markdown(
    period: Period,
    stats: PeriodStats,
    summary_text: str | None,
    storage_usage: str | None = None,
) -> str:
    lines = [
        f"# {period.label} のまとめ",
        "",
        f"- 期間: {period.start:%Y-%m-%d} 〜 {period.end:%Y-%m-%d}",
        f"- 記録した日数: {stats.day_count}日",
        f"- 記録件数: {stats.entry_count}件",
        f"- 画像: {stats.image_count}枚",
    ]
    if storage_usage:
        lines.append(f"- 画像ストレージ使用量: {storage_usage}")
    lines.append("")

    if summary_text:
        lines.extend(["## まとめ", "", summary_text, ""])
    elif stats.entry_count == 0:
        lines.extend(["この期間の記録はありません。", ""])
    return "\n".join(lines)


def build_notification(period: Period, stats: PeriodStats, url: str | None) -> str:
    kind_label = "今週" if period.kind == "weekly" else "今月"
    header = f"📗 {period.label} のまとめを作成しました（{kind_label}分）"
    body = f"{stats.day_count}日 / {stats.entry_count}件の記録"
    return f"{header}\n{body}\n{url}" if url else f"{header}\n{body}"
