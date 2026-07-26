"""Parses the daily Markdown files back into structured entries.

github_service writes these files; this module reads them, so the web
viewer and the summarizer both work from one parser rather than each
re-deriving the format.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.tagging import parse_tag_line

ENTRY_HEADING_RE = re.compile(r"^## (\d{2}:\d{2})\s*$")
METADATA_PREFIX = "- Discord投稿者:"
ATTACHMENT_HEADING = "- 添付ファイル:"
_ATTACHMENT_KEY_RE = re.compile(r"^\s*-\s*`(?P<key>[^`]+)`\s*$")
_AUTHOR_RE = re.compile(r"^- Discord投稿者:\s*(?P<author>.+?)\s*$")
_MESSAGE_ID_RE = re.compile(r"^- DiscordメッセージID:\s*(?P<message_id>\d+)\s*$")
_TAGS_RE = re.compile(r"^- タグ:\s*(?P<tags>.+?)\s*$")


@dataclass
class ParsedEntry:
    time_str: str
    body: str
    author: str = ""
    image_keys: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    message_id: str = ""


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
            tags = _TAGS_RE.match(line)
            if tags:
                current.tags = parse_tag_line(tags.group("tags"))
                continue
            message_id = _MESSAGE_ID_RE.match(line)
            if message_id:
                current.message_id = message_id.group("message_id")
                continue
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
