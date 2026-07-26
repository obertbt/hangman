"""Parses the daily Markdown files back into structured entries.

github_service writes these files; this module reads them, so the web
viewer and the summarizer both work from one parser rather than each
re-deriving the format.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

ENTRY_HEADING_RE = re.compile(r"^## (\d{2}:\d{2})\s*$")
METADATA_PREFIX = "- Discord投稿者:"
ATTACHMENT_HEADING = "- 添付ファイル:"
_ATTACHMENT_KEY_RE = re.compile(r"^\s*-\s*`(?P<key>[^`]+)`\s*$")
_AUTHOR_RE = re.compile(r"^- Discord投稿者:\s*(?P<author>.+?)\s*$")


@dataclass
class ParsedEntry:
    time_str: str
    body: str
    author: str = ""
    image_keys: list[str] = field(default_factory=list)


def parse_daily_markdown(markdown: str) -> list[ParsedEntry]:
    """Entries in file order. Malformed sections are skipped, not raised."""
    entries: list[ParsedEntry] = []
    current: ParsedEntry | None = None
    body_lines: list[str] = []
    in_metadata = False

    def flush() -> None:
        nonlocal current, body_lines, in_metadata
        if current is not None:
            current.body = "\n".join(body_lines).strip()
            entries.append(current)
        current = None
        body_lines = []
        in_metadata = False

    for line in markdown.splitlines():
        heading = ENTRY_HEADING_RE.match(line)
        if heading:
            flush()
            current = ParsedEntry(time_str=heading.group(1), body="")
            continue
        if current is None:
            continue

        if line.startswith(METADATA_PREFIX):
            in_metadata = True
            author = _AUTHOR_RE.match(line)
            if author:
                current.author = author.group("author")
            continue

        if in_metadata:
            key = _ATTACHMENT_KEY_RE.match(line)
            if key and line.startswith("  "):
                current.image_keys.append(key.group("key"))
            continue

        body_lines.append(line)

    flush()
    return entries


def entry_bodies(markdown: str) -> list[str]:
    """Just the text the user wrote, for summarization."""
    return [entry.body for entry in parse_daily_markdown(markdown) if entry.body]
