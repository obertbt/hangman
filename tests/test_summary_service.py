from unittest.mock import MagicMock, patch

import pytest

from app.summary_service import (
    DEFAULT_HEADING,
    MAX_SUMMARY_LENGTH,
    SYSTEM_PROMPT,
    ClaudeSummarizer,
    OllamaSummarizer,
    Summarizer,
    build_prompt,
    clean_summary,
    create_summarizer,
    summarize_entries,
)
from tests.test_config import _make_config


def test_build_prompt_numbers_entries():
    prompt = build_prompt(["朝ラン5km", "夕方に買い物"])
    assert "1. 朝ラン5km" in prompt
    assert "2. 夕方に買い物" in prompt


def test_clean_summary_strips_whitespace():
    assert clean_summary("  今日は走った。  ") == "今日は走った。"


def test_clean_summary_returns_none_for_blank():
    assert clean_summary("   \n  ") is None


def test_clean_summary_truncates_long_text():
    summary = clean_summary("あ" * (MAX_SUMMARY_LENGTH + 100))
    assert len(summary) == MAX_SUMMARY_LENGTH
    assert summary.endswith("…")


def test_create_summarizer_defaults_to_disabled():
    summarizer = create_summarizer(_make_config(summary_provider="none"))
    assert type(summarizer) is Summarizer


def test_create_summarizer_selects_ollama():
    summarizer = create_summarizer(_make_config(summary_provider="ollama"))
    assert isinstance(summarizer, OllamaSummarizer)


def test_create_summarizer_selects_claude():
    summarizer = create_summarizer(
        _make_config(summary_provider="claude", anthropic_api_key="sk-test")
    )
    assert isinstance(summarizer, ClaudeSummarizer)


@pytest.mark.asyncio
async def test_disabled_summarizer_returns_none():
    assert await Summarizer().summarize(["何か"]) is None


@pytest.mark.asyncio
async def test_summarize_entries_skips_empty_input():
    summarizer = MagicMock()
    assert await summarize_entries(summarizer, []) is None
    summarizer.summarize.assert_not_called()


@pytest.mark.asyncio
async def test_summarize_entries_swallows_failures():
    """A summary is a bonus — losing it must not cost the notification."""

    class Boom(Summarizer):
        async def summarize(self, entries, *args, **kwargs):
            raise RuntimeError("model unavailable")

    assert await summarize_entries(Boom(), ["朝ラン5km"]) is None


@pytest.mark.asyncio
async def test_summarize_entries_returns_summary():
    class Fake(Summarizer):
        async def summarize(self, entries, *args, **kwargs):
            return "走って買い物をした一日。"

    assert await summarize_entries(Fake(), ["朝ラン5km"]) == "走って買い物をした一日。"


def test_ollama_summarizer_builds_chat_endpoint():
    summarizer = OllamaSummarizer(
        _make_config(summary_provider="ollama", ollama_url="http://localhost:11434/")
    )
    assert summarizer._url == "http://localhost:11434/api/chat"


def test_claude_summarizer_sends_system_prompt_and_returns_text():
    config = _make_config(
        summary_provider="claude", anthropic_api_key="sk-test", anthropic_model="claude-opus-5"
    )
    summarizer = ClaudeSummarizer(config)

    block = MagicMock()
    block.type = "text"
    block.text = "走って買い物をした一日。"
    response = MagicMock(stop_reason="end_turn", content=[block])
    fake_anthropic = MagicMock()
    fake_anthropic.Anthropic.return_value.messages.create.return_value = response

    with patch.dict("sys.modules", {"anthropic": fake_anthropic}):
        result = summarizer._summarize_sync(
            ["朝ラン5km"], SYSTEM_PROMPT, MAX_SUMMARY_LENGTH, DEFAULT_HEADING
        )

    assert result == "走って買い物をした一日。"
    kwargs = fake_anthropic.Anthropic.return_value.messages.create.call_args.kwargs
    assert kwargs["model"] == "claude-opus-5"
    assert "要約アシスタント" in kwargs["system"]


def test_claude_summarizer_returns_none_on_refusal():
    summarizer = ClaudeSummarizer(_make_config(anthropic_api_key="sk-test"))
    response = MagicMock(stop_reason="refusal", content=[])
    fake_anthropic = MagicMock()
    fake_anthropic.Anthropic.return_value.messages.create.return_value = response

    with patch.dict("sys.modules", {"anthropic": fake_anthropic}):
        assert (
            summarizer._summarize_sync(
                ["朝ラン5km"], SYSTEM_PROMPT, MAX_SUMMARY_LENGTH, DEFAULT_HEADING
            )
            is None
        )


@pytest.mark.asyncio
async def test_ollama_summarizer_caps_generation_length():
    """An unbounded reply can burn the whole tagging timeout."""
    summarizer = OllamaSummarizer(_make_config(summary_provider="ollama"))
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        async def json(self):
            return {"message": {"content": "運動"}}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    class FakeSession:
        def post(self, url, json):
            captured.update(json)
            return FakeResponse()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    with patch("app.summary_service.aiohttp.ClientSession", lambda **kwargs: FakeSession()):
        assert await summarizer.summarize(["朝ラン5km"], SYSTEM_PROMPT, 100, "見出し") == "運動"

    assert captured["options"]["num_predict"] == 100
