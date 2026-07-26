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

MAX_SUMMARY_LENGTH = 500


def build_prompt(entries: list[str]) -> str:
    numbered = "\n".join(f"{i}. {entry}" for i, entry in enumerate(entries, start=1))
    return f"以下は今日の記録です。\n\n{numbered}"


def clean_summary(text: str) -> str | None:
    """Trim the model's reply to something fit for a Discord message."""
    summary = text.strip()
    if not summary:
        return None
    if len(summary) > MAX_SUMMARY_LENGTH:
        summary = summary[: MAX_SUMMARY_LENGTH - 1] + "…"
    return summary


class Summarizer:
    """Base class; the default implementation summarizes nothing."""

    async def summarize(self, entries: list[str]) -> str | None:
        return None


class OllamaSummarizer(Summarizer):
    """Uses a model served by a local Ollama instance."""

    def __init__(self, config: Config):
        self._url = config.ollama_url.rstrip("/") + "/api/chat"
        self._model = config.ollama_model
        self._timeout = config.summary_timeout_seconds

    async def summarize(self, entries: list[str]) -> str | None:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_prompt(entries)},
            ],
            "stream": False,
        }
        timeout = aiohttp.ClientTimeout(total=self._timeout)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(self._url, json=payload) as response:
                response.raise_for_status()
                data = await response.json()
        return clean_summary(data.get("message", {}).get("content", ""))


class ClaudeSummarizer(Summarizer):
    """Uses the Anthropic API."""

    def __init__(self, config: Config):
        self._api_key = config.anthropic_api_key
        self._model = config.anthropic_model
        self._timeout = config.summary_timeout_seconds

    def _summarize_sync(self, entries: list[str]) -> str | None:
        # Imported lazily so the anthropic package is only required when
        # this provider is actually selected.
        import anthropic

        client = anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout)
        response = client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_prompt(entries)}],
        )
        if response.stop_reason == "refusal":
            logger.warning("要約リクエストが拒否されました")
            return None
        text = "".join(block.text for block in response.content if block.type == "text")
        return clean_summary(text)

    async def summarize(self, entries: list[str]) -> str | None:
        return await asyncio.to_thread(self._summarize_sync, entries)


def create_summarizer(config: Config) -> Summarizer:
    if config.summary_provider == PROVIDER_OLLAMA:
        return OllamaSummarizer(config)
    if config.summary_provider == PROVIDER_CLAUDE:
        return ClaudeSummarizer(config)
    return Summarizer()


async def summarize_entries(summarizer: Summarizer, entries: list[str]) -> str | None:
    """Best-effort summary: any failure is logged and yields None."""
    if not entries:
        return None
    try:
        return await summarizer.summarize(entries)
    except Exception:
        logger.exception("要約の生成に失敗しました")
        return None
