"""Plain data structures shared across the app.

Kept independent of discord.py / boto3 / PyGithub types so the core logic
in discord_handler.py can be unit tested without a real Discord connection.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class IncomingAttachment:
    filename: str
    content_type: str | None
    size: int
    url: str


@dataclass
class IncomingMessage:
    guild_id: int
    channel_id: int
    author_id: int
    author_display_name: str
    author_is_bot: bool
    message_id: int
    content: str
    created_at: datetime  # timezone-aware
    attachments: list[IncomingAttachment] = field(default_factory=list)


@dataclass
class UploadedImage:
    object_key: str
    filename: str


@dataclass
class MarkdownEntryData:
    time_str: str
    content: str
    author_name: str
    author_id: int
    message_id: int
    iso_datetime: str
    r2_keys: list[str] = field(default_factory=list)


@dataclass
class ProcessResult:
    success: bool
    reply: str
