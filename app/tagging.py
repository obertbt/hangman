"""Assigns a few tags to each diary entry, using the configured LLM.

Tags come from a fixed vocabulary rather than whatever the model invents.
A closed set keeps the search filter meaningful over time — "運動" always
means the same thing — and it means a model that ignores its instructions
cannot write arbitrary text into the diary file.

Tagging is best-effort: every failure path yields no tags at all, so an
entry is always saved. It runs inside the save path, so it is also given
its own (short) timeout rather than the summarizer's.
"""
from __future__ import annotations

import asyncio
import logging
import re

from app.summary_service import Summarizer

logger = logging.getLogger(__name__)

MAX_TAGS = 3
MAX_TAG_LENGTH = 20
# The reply is a short list, not prose; anything longer is the model
# ignoring the format, and the extra text is discarded by parse_tags.
MAX_TAG_REPLY_LENGTH = 100

TAG_HEADING = "以下の記録に当てはまるタグを選んでください。"

_SEPARATOR_RE = re.compile(r"[\s,、。・/／|｜]+")
_TAG_MARKS = "#＃「」『』【】()（）\"'`*-:："


def build_tag_system_prompt(vocabulary: tuple[str, ...]) -> str:
    """The instructions the model gets. The vocabulary is embedded so the
    prompt always matches whatever TAG_VOCABULARY is configured to."""
    choices = " / ".join(vocabulary)
    return (
        "あなたは日記の分類アシスタントです。"
        f"与えられた記録に当てはまるタグを、次の一覧から最大{MAX_TAGS}個選んでください。\n"
        f"一覧: {choices}\n"
        "一覧にない言葉は絶対に使わないでください。"
        "当てはまるものが無ければ、何も出力しないでください。"
        "選んだタグだけを半角スペース区切りで出力し、説明や記号は付けないでください。"
    )


def parse_tags(text: str, vocabulary: tuple[str, ...]) -> list[str]:
    """Pull known tags out of the model's reply.

    Anything outside the vocabulary is dropped rather than trusted, so a
    chatty or misbehaving model degrades to fewer tags, never to junk.
    """
    allowed = set(vocabulary)
    found: list[str] = []
    for token in _SEPARATOR_RE.split(text or ""):
        candidate = token.strip().strip(_TAG_MARKS).strip()
        if candidate in allowed and candidate not in found:
            found.append(candidate)
        if len(found) >= MAX_TAGS:
            break
    return found


def format_tags(tags: list[str]) -> str:
    """`#運動 #買い物` — how tags are written into the Markdown file."""
    return " ".join(f"#{tag}" for tag in tags)


def parse_tag_line(value: str) -> list[str]:
    """Read back a `- タグ:` line. Unknown tags are kept.

    The vocabulary can change between runs; an entry tagged under the old
    list should keep the tag it was saved with rather than lose it.
    """
    tags: list[str] = []
    for token in _SEPARATOR_RE.split(value or ""):
        candidate = token.strip().strip(_TAG_MARKS).strip()
        if candidate and len(candidate) <= MAX_TAG_LENGTH and candidate not in tags:
            tags.append(candidate)
    return tags


async def generate_tags(
    summarizer: Summarizer,
    body: str,
    vocabulary: tuple[str, ...],
    timeout_seconds: int,
) -> list[str]:
    """Tags for one entry; an empty list whenever anything goes wrong."""
    if not body.strip() or not vocabulary:
        return []
    try:
        reply = await asyncio.wait_for(
            summarizer.summarize(
                [body],
                build_tag_system_prompt(vocabulary),
                MAX_TAG_REPLY_LENGTH,
                TAG_HEADING,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning("タグ付けがタイムアウトしました（%s秒）", timeout_seconds)
        return []
    except Exception:
        logger.exception("タグの生成に失敗しました")
        return []
    return parse_tags(reply or "", vocabulary)
