"""Summarizes a day's diary entries.

Three interchangeable providers, chosen with SUMMARY_PROVIDER:

- ``none``   — disabled (the default); the evening notification is unchanged.
- ``ollama`` — a model running locally, so the diary never leaves the machine.
- ``claude`` — the Anthropic API, for the highest quality.

Summarization is best-effort: every failure path returns None so the
evening notification still goes out without it.
"""
from __future__ import annotations

import asyncio
import logging
import re

import aiohttp

from app.config import Config

logger = logging.getLogger(__name__)

PROVIDER_NONE = "none"
PROVIDER_OLLAMA = "ollama"
PROVIDER_CLAUDE = "claude"
SUPPORTED_PROVIDERS = (PROVIDER_NONE, PROVIDER_OLLAMA, PROVIDER_CLAUDE)

SYSTEM_PROMPT = (
    "あなたは日記の要約アシスタントです。"
    "与えられた1日の記録を、日本語で2〜3行に簡潔にまとめてください。"
    "記録に書かれている事実だけを使い、推測や感想、励ましの言葉は追加しないでください。"
    "箇条書きにせず、短い文章で書いてください。"
)

PERIOD_SYSTEM_PROMPT = (
    "あなたは日記の要約アシスタントです。"
    "与えられた一定期間の記録を、日本語で5〜8行にまとめてください。"
    "繰り返し出てくる活動や、その期間の傾向が分かるように書いてください。"
    "記録に書かれている事実だけを使い、推測や励ましの言葉は追加しないでください。"
)

MAX_SUMMARY_LENGTH = 500
MAX_PERIOD_SUMMARY_LENGTH = 2000


DEFAULT_HEADING = "以下は今日の記録です。"

_THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_UNCLOSED_THINK_RE = re.compile(r"<think>.*", re.DOTALL | re.IGNORECASE)


def build_prompt(entries: list[str], heading: str = DEFAULT_HEADING) -> str:
    numbered = "\n".join(f"{i}. {entry}" for i, entry in enumerate(entries, start=1))
    return f"{heading}\n\n{numbered}"


def period_prompt_heading(label: str) -> str:
    return f"以下は{label}の記録です（日付ごとにまとめてあります）。"


def strip_reasoning(text: str) -> str:
    """Drop a reasoning model's `<think>` block.

    Models like qwen3 and deepseek-r1 think out loud before answering.
    That text is not the answer, and leaving it in would bury a short
    reply — a tag list especially — under a paragraph of deliberation.
    """
    without_blocks = _THINK_BLOCK_RE.sub("", text)
    # An unterminated block means generation was cut off mid-thought:
    # there is no answer after it, so drop the remainder too.
    return _UNCLOSED_THINK_RE.sub("", without_blocks)


def clean_summary(text: str, max_length: int = MAX_SUMMARY_LENGTH) -> str | None:
    """Trim the model's reply to something fit for a Discord message."""
    summary = strip_reasoning(text).strip()
    if not summary:
        return None
    if len(summary) > max_length:
        summary = summary[: max_length - 1] + "…"
    return summary


class Summarizer:
    """Base class; the default implementation summarizes nothing."""

    async def summarize(
        self,
        entries: list[str],
        system_prompt: str = SYSTEM_PROMPT,
        max_length: int = MAX_SUMMARY_LENGTH,
        heading: str = DEFAULT_HEADING,
    ) -> str | None:
        return None


class OllamaSummarizer(Summarizer):
    """Uses a model served by a local Ollama instance."""

    def __init__(self, config: Config):
        self._url = config.ollama_url.rstrip("/") + "/api/chat"
        self._model = config.ollama_model
        self._timeout = config.summary_timeout_seconds

    async def summarize(
        self,
        entries: list[str],
        system_prompt: str = SYSTEM_PROMPT,
        max_length: int = MAX_SUMMARY_LENGTH,
        heading: str = DEFAULT_HEADING,
    ) -> str | None:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": build_prompt(entries, heading)},
            ],
            "stream": False,
            # Anything past max_length is discarded by clean_summary, so
            # capping generation saves the model writing it in the first
            # place. Tagging asks for a handful of words and would
            # otherwise wait out a model that decided to explain itself.
            "options": {"num_predict": max_length},
        }
        timeout = aiohttp.ClientTimeout(total=self._timeout)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(self._url, json=payload) as response:
                response.raise_for_status()
                data = await response.json()
        return clean_summary(data.get("message", {}).get("content", ""), max_length)


class ClaudeSummarizer(Summarizer):
    """Uses the Anthropic API."""

    def __init__(self, config: Config):
        self._api_key = config.anthropic_api_key
        self._model = config.anthropic_model
        self._timeout = config.summary_timeout_seconds

    def _summarize_sync(
        self, entries: list[str], system_prompt: str, max_length: int, heading: str
    ) -> str | None:
        # Imported lazily so the anthropic package is only required when
        # this provider is actually selected.
        import anthropic

        client = anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout)
        response = client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": build_prompt(entries, heading)}],
        )
        if response.stop_reason == "refusal":
            logger.warning("要約リクエストが拒否されました")
            return None
        text = "".join(block.text for block in response.content if block.type == "text")
        return clean_summary(text, max_length)

    async def summarize(
        self,
        entries: list[str],
        system_prompt: str = SYSTEM_PROMPT,
        max_length: int = MAX_SUMMARY_LENGTH,
        heading: str = DEFAULT_HEADING,
    ) -> str | None:
        return await asyncio.to_thread(
            self._summarize_sync, entries, system_prompt, max_length, heading
        )


def create_summarizer(config: Config) -> Summarizer:
    if config.summary_provider == PROVIDER_OLLAMA:
        return OllamaSummarizer(config)
    if config.summary_provider == PROVIDER_CLAUDE:
        return ClaudeSummarizer(config)
    return Summarizer()


async def summarize_entries(
    summarizer: Summarizer,
    entries: list[str],
    system_prompt: str = SYSTEM_PROMPT,
    max_length: int = MAX_SUMMARY_LENGTH,
    heading: str = DEFAULT_HEADING,
) -> str | None:
    """Best-effort summary: any failure is logged and yields None."""
    if not entries:
        return None
    try:
        return await summarizer.summarize(entries, system_prompt, max_length, heading)
    except Exception:
        logger.exception("要約の生成に失敗しました")
        return None
