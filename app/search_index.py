"""A local SQLite index of the diary, so searching is instant.

GitHub stays the source of truth. This index is a derived cache: it can
be deleted and rebuilt from the Markdown files at any time, and nothing
is stored here that is not already in the repository. R2 keys are
deliberately *not* indexed — only how many images an entry has — so a
leaked index file still cannot address the private bucket.

Deliberately not FTS5. The diary is Japanese, and SQLite's default
tokenizer sees a whole Japanese sentence as a single token, so a phrase
search would match nothing; the trigram tokenizer fixes that but then
refuses queries shorter than three characters, which rules out searches
like 「ラン」. A LIKE scan over a few thousand short entries takes
milliseconds and matches substrings the way a reader expects.
"""
from __future__ import annotations

import logging
import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

from app.diary import parse_daily_markdown

logger = logging.getLogger(__name__)

MAX_RESULTS = 50
SNIPPET_LENGTH = 120
TAG_SEPARATOR = " "

_SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    entry_key   TEXT PRIMARY KEY,
    date_str    TEXT NOT NULL,
    time_str    TEXT NOT NULL,
    body        TEXT NOT NULL,
    body_lower  TEXT NOT NULL,
    author      TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '',
    image_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date_str);
"""


@dataclass
class IndexedEntry:
    """One diary entry as the index stores it."""

    date_str: str
    time_str: str
    body: str
    author: str = ""
    tags: list[str] = field(default_factory=list)
    image_count: int = 0
    message_id: str = ""

    @property
    def entry_key(self) -> str:
        """Stable identity, so re-indexing replaces rather than duplicates.

        The Discord message ID is unique per entry; entries written before
        it was recorded fall back to their position in the day's file.
        """
        if self.message_id:
            return f"msg:{self.message_id}"
        return f"day:{self.date_str}#{self.time_str}"


@dataclass
class SearchHit:
    date_str: str
    time_str: str
    body: str
    tags: list[str]
    image_count: int


def split_terms(query: str) -> list[str]:
    """Whitespace-separated terms, all of which must match (AND)."""
    return [term for term in (query or "").split() if term]


def escape_like(value: str) -> str:
    """Escape the LIKE wildcards. Without this, a search for "50%" would
    match every entry."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def like_pattern(term: str) -> str:
    """A LIKE pattern matching `term` literally, anywhere in the field."""
    return f"%{escape_like(term.lower())}%"


def build_snippet(body: str, terms: Sequence[str], length: int = SNIPPET_LENGTH) -> str:
    """A short excerpt centred on the first matching term."""
    flat = " ".join(body.split())
    if len(flat) <= length:
        return flat

    lowered = flat.lower()
    position = -1
    for term in terms:
        found = lowered.find(term.lower())
        if found != -1 and (position == -1 or found < position):
            position = found
    if position == -1:
        return flat[:length] + "…"

    start = max(0, position - length // 3)
    excerpt = flat[start : start + length]
    return ("…" if start > 0 else "") + excerpt + ("…" if start + length < len(flat) else "")


def entries_from_markdown(date_str: str, markdown: str) -> list[IndexedEntry]:
    """Index rows for one day's Markdown file."""
    return [
        IndexedEntry(
            date_str=date_str,
            time_str=parsed.time_str,
            body=parsed.body,
            author=parsed.author,
            tags=list(parsed.tags),
            image_count=len(parsed.image_keys),
            message_id=parsed.message_id,
        )
        for parsed in parse_daily_markdown(markdown)
        if parsed.body or parsed.image_keys
    ]


class SearchIndex:
    """Thread-safe wrapper around the SQLite file.

    The bot touches this from `asyncio.to_thread`, so every statement
    runs under one lock on a single shared connection.
    """

    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        with self._lock:
            self._connection.executescript(_SCHEMA)
            self._connection.commit()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def count(self) -> int:
        with self._lock:
            row = self._connection.execute("SELECT COUNT(*) AS n FROM entries").fetchone()
        return int(row["n"])

    def index_entry(self, entry: IndexedEntry) -> None:
        with self._lock:
            self._write(entry)
            self._connection.commit()

    def replace_day(self, date_str: str, entries: Iterable[IndexedEntry]) -> int:
        """Re-index one day, dropping whatever was stored for it before."""
        with self._lock:
            self._connection.execute("DELETE FROM entries WHERE date_str = ?", (date_str,))
            written = 0
            for entry in entries:
                self._write(entry)
                written += 1
            self._connection.commit()
        return written

    def index_markdown(self, date_str: str, markdown: str) -> int:
        return self.replace_day(date_str, entries_from_markdown(date_str, markdown))

    def rebuild(self, days: Iterable[tuple[str, str]]) -> int:
        """Discard everything and re-index the given (date, markdown) pairs."""
        with self._lock:
            self._connection.execute("DELETE FROM entries")
            self._connection.commit()
        total = 0
        for date_str, markdown in days:
            total += self.index_markdown(date_str, markdown)
        return total

    def search(self, query: str, tag: str | None = None, limit: int = MAX_RESULTS) -> list[SearchHit]:
        """Entries matching every term, newest first."""
        terms = split_terms(query)
        if not terms and not tag:
            return []

        clauses: list[str] = []
        params: list[object] = []
        for term in terms:
            # Tags are searchable too, so 「運動」 finds tagged entries
            # even when the word itself never appears in the text.
            clauses.append(
                "(body_lower LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')"
            )
            pattern = like_pattern(term)
            params.extend([pattern, pattern])
        if tag:
            clauses.append("(' ' || tags || ' ') LIKE ? ESCAPE '\\'")
            params.append(f"% {escape_like(tag)} %")

        sql = (
            "SELECT date_str, time_str, body, tags, image_count FROM entries WHERE "
            + " AND ".join(clauses)
            + " ORDER BY date_str DESC, time_str DESC LIMIT ?"
        )
        params.append(max(1, limit))
        with self._lock:
            rows = self._connection.execute(sql, params).fetchall()
        return [
            SearchHit(
                date_str=row["date_str"],
                time_str=row["time_str"],
                body=row["body"],
                tags=row["tags"].split(TAG_SEPARATOR) if row["tags"] else [],
                image_count=int(row["image_count"]),
            )
            for row in rows
        ]

    def tag_counts(self) -> list[tuple[str, int]]:
        """Every indexed tag with its entry count, most used first."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT tags FROM entries WHERE tags <> ''"
            ).fetchall()
        counts: dict[str, int] = {}
        for row in rows:
            for tag in row["tags"].split(TAG_SEPARATOR):
                if tag:
                    counts[tag] = counts.get(tag, 0) + 1
        return sorted(counts.items(), key=lambda item: (-item[1], item[0]))

    def _write(self, entry: IndexedEntry) -> None:
        self._connection.execute(
            "INSERT OR REPLACE INTO entries "
            "(entry_key, date_str, time_str, body, body_lower, author, tags, image_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                entry.entry_key,
                entry.date_str,
                entry.time_str,
                entry.body,
                entry.body.lower(),
                entry.author,
                TAG_SEPARATOR.join(entry.tags),
                entry.image_count,
            ),
        )
