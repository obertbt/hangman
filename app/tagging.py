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
# The answer is a short list, but a reasoning model spends hundreds of
# tokens thinking before it gets there. Budget for that: cut generation
# off mid-thought and the answer never arrives at all.
MAX_TAG_REPLY_LENGTH = 600
MAX_LOGGED_REPLY_LENGTH = 120

TAG_HEADING = "以下の記録に当てはまるタグを選んでください。"

NO_TAG_TOKEN = "なし"
_NO_TAG_REPLIES = frozenset(
    {
        NO_TAG_TOKEN,
        "無し",
        "該当なし",
        "該当するタグはありません",
        "該当するタグなし",
        # Observed from qwen2.5:3b: it wrote the old instruction back.
        "何も出力しない",
        "none",
        "n/a",
        "-",
    }
)

_SEPARATOR_RE = re.compile(r"[\s,、。・/／|｜]+")
_TAG_MARKS = "#＃「」『』【】()（）\"'`*-:："


def build_tag_system_prompt(vocabulary: tuple[str, ...]) -> str:
    """The instructions the model gets. The vocabulary is embedded so the
    prompt always matches whatever TAG_VOCABULARY is configured to.

    "Output nothing" is never asked for: a small model answers that by
    writing the instruction back at you. It is given a word to say
    instead, plus an example of each case to copy.
    """
    choices = " / ".join(vocabulary)
    return (
        "あなたは日記の分類アシスタントです。"
        f"与えられた記録に当てはまるタグを、次の一覧から最大{MAX_TAGS}個選んでください。\n"
        f"一覧: {choices}\n"
        "出力は、選んだタグを半角スペースで区切って並べたものだけにしてください。"
        f"当てはまるタグが一つも無いときは {NO_TAG_TOKEN} とだけ出力してください。"
        "一覧にない言葉・説明・記号は一切出力しないでください。\n"
        "出力例1: 運動 健康\n"
        f"出力例2: {NO_TAG_TOKEN}"
    )


def means_no_tags(reply: str | None) -> bool:
    """Whether the model is saying nothing applies.

    That is a normal outcome, not a fault, so it must not be reported as
    one. The instruction itself is listed because a small model answers
    by repeating it rather than by staying quiet.
    """
    if not reply:
        return False
    cleaned = " ".join(reply.split()).strip("。.、,！!　 ").lower()
    return cleaned in _NO_TAG_REPLIES


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


def summarize_reply_for_log(reply: str | None) -> str:
    """A short, single-line form of the model's reply, for diagnosis.

    The reply is derived from a diary entry, so only enough to see what
    shape the answer took is kept — never the whole thing.
    """
    if not reply:
        return "（空の回答）"
    flat = " ".join(reply.split())
    if len(flat) > MAX_LOGGED_REPLY_LENGTH:
        return flat[:MAX_LOGGED_REPLY_LENGTH] + "…"
    return flat


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

    # Every branch below logs: a silent return is why a misbehaving model
    # looked exactly like tagging never running.
    tags = parse_tags(reply or "", vocabulary)
    if tags:
        return tags
    if means_no_tags(reply):
        logger.info("この投稿に当てはまるタグはありませんでした")
    elif reply:
        logger.warning(
            "AIの回答にタグが見つかりませんでした（回答: %s）。"
            "一覧にない言葉は採用しないため、タグ無しで保存します。",
            summarize_reply_for_log(reply),
        )
    else:
        logger.warning(
            "AIがタグを返しませんでした。qwen3 のような思考モデルは、"
            "考えている途中で出力の上限に達し、答えに辿り着かないことがあります。"
            "OLLAMA_MODEL を qwen2.5:3b などに変更してください。"
        )
    return []
