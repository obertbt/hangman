import asyncio

import pytest

from app.config import DEFAULT_TAG_VOCABULARY
from app.summary_service import Summarizer
from app.tagging import (
    MAX_TAGS,
    build_tag_system_prompt,
    format_tags,
    generate_tags,
    parse_tag_line,
    parse_tags,
)

VOCAB = DEFAULT_TAG_VOCABULARY


def test_system_prompt_lists_the_configured_vocabulary():
    prompt = build_tag_system_prompt(("運動", "仕事"))
    assert "運動 / 仕事" in prompt
    assert "買い物" not in prompt


def test_parse_tags_accepts_space_separated_names():
    assert parse_tags("運動 買い物", VOCAB) == ["運動", "買い物"]


def test_parse_tags_strips_hash_marks_and_punctuation():
    assert parse_tags("#運動、#食事。", VOCAB) == ["運動", "食事"]


def test_parse_tags_drops_words_outside_the_vocabulary():
    """A model that invents tags must not write them into the diary."""
    assert parse_tags("運動 ホッケー 深夜テンション", VOCAB) == ["運動"]


def test_parse_tags_ignores_a_chatty_reply():
    assert parse_tags("承知しました。タグは 運動 です。", VOCAB) == ["運動"]


def test_parse_tags_deduplicates():
    assert parse_tags("運動 運動 運動", VOCAB) == ["運動"]


def test_parse_tags_caps_the_count():
    assert len(parse_tags("運動 仕事 家族 食事 買い物", VOCAB)) == MAX_TAGS


def test_parse_tags_handles_an_empty_reply():
    assert parse_tags("", VOCAB) == []


def test_format_tags_writes_hash_prefixed_names():
    assert format_tags(["運動", "健康"]) == "#運動 #健康"


def test_parse_tag_line_round_trips_format_tags():
    assert parse_tag_line(format_tags(["運動", "健康"])) == ["運動", "健康"]


def test_parse_tag_line_keeps_tags_outside_the_current_vocabulary():
    """The vocabulary can change; an old entry keeps what it was saved with."""
    assert parse_tag_line("#ホッケー #運動") == ["ホッケー", "運動"]


class FakeSummarizer(Summarizer):
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def summarize(self, entries, system_prompt=None, max_length=None, heading=None):
        self.calls.append((entries, system_prompt))
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


@pytest.mark.asyncio
async def test_generate_tags_returns_parsed_tags():
    summarizer = FakeSummarizer("運動 健康")
    assert await generate_tags(summarizer, "朝ラン5km", VOCAB, 30) == ["運動", "健康"]


@pytest.mark.asyncio
async def test_generate_tags_skips_an_empty_body():
    summarizer = FakeSummarizer("運動")
    assert await generate_tags(summarizer, "   ", VOCAB, 30) == []
    assert summarizer.calls == []


@pytest.mark.asyncio
async def test_generate_tags_survives_a_failing_model():
    """Tagging is a bonus — losing it must never cost the diary entry."""
    summarizer = FakeSummarizer(RuntimeError("model unavailable"))
    assert await generate_tags(summarizer, "朝ラン5km", VOCAB, 30) == []


@pytest.mark.asyncio
async def test_generate_tags_gives_up_on_a_slow_model():
    class Slow(Summarizer):
        async def summarize(self, entries, *args, **kwargs):
            await asyncio.sleep(5)
            return "運動"

    assert await generate_tags(Slow(), "朝ラン5km", VOCAB, 0.05) == []


@pytest.mark.asyncio
async def test_generate_tags_returns_nothing_without_a_vocabulary():
    summarizer = FakeSummarizer("運動")
    assert await generate_tags(summarizer, "朝ラン5km", (), 30) == []
    assert summarizer.calls == []
