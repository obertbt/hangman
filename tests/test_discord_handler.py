from datetime import datetime
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from app.config import DEFAULT_TAG_VOCABULARY, Config
from app.discord_handler import (
    AttachmentDownloadError,
    build_failure_reply,
    build_image_url_reply,
    build_search_reply,
    build_success_reply,
    describe_rejection,
    filter_image_attachments,
    accepted_task_channels,
    is_dedicated_task_channel,
    is_task_command,
    is_task_message,
    notification_channel_id,
    open_search_index,
    parse_task_text,
    process_message,
    process_task_command,
    should_process,
    task_channel_id,
    task_text_of,
)
from app.github_service import GitHubIssueError, GitHubSaveError
from app.models import IncomingAttachment, IncomingMessage
from app.search_index import SearchHit, SearchIndex

UTC = ZoneInfo("UTC")


def _make_config(**overrides) -> Config:
    defaults = dict(
        discord_bot_token="t",
        discord_guild_id=111,
        discord_daily_channel_id=222,
        discord_task_channel_id=None,
        allowed_discord_user_ids=frozenset(),
        github_token="t",
        github_owner="owner",
        github_repo="hearth-life",
        github_branch="main",
        r2_account_id="a",
        r2_access_key_id="k",
        r2_secret_access_key="s",
        r2_bucket_name="hearth-media",
        r2_endpoint_url="https://example.com",
        timezone="Asia/Tokyo",
        max_attachment_size_mb=20,
        signed_url_expiry_seconds=300,
        notification_channel_id=None,
        morning_notification_time=None,
        evening_notification_time=None,
        log_file=None,
        log_max_bytes=5 * 1024 * 1024,
        log_backup_count=3,
        periodic_summary_enabled=False,
        periodic_summary_time=None,
        periodic_summary_max_input_chars=12000,
        report_storage_usage=True,
        tagging_enabled=False,
        tag_vocabulary=DEFAULT_TAG_VOCABULARY,
        tagging_timeout_seconds=30,
        search_enabled=False,
        search_index_path="data/search.db",
        search_backfill_days=730,
        healthcheck_url=None,
        healthcheck_interval_minutes=60,
        weather_latitude=None,
        weather_longitude=None,
        web_enabled=False,
        web_host="127.0.0.1",
        web_port=8787,
        web_password=None,
        web_session_hours=720,
        summary_provider="none",
        summary_timeout_seconds=180,
        ollama_url="http://localhost:11434",
        ollama_model="qwen2.5:7b",
        anthropic_api_key=None,
        anthropic_model="claude-opus-5",
    )
    defaults.update(overrides)
    return Config(**defaults)


def _make_message(**overrides) -> IncomingMessage:
    defaults = dict(
        guild_id=111,
        channel_id=222,
        author_id=1,
        author_display_name="tomoya",
        author_is_bot=False,
        message_id=123456789,
        content="今日はホッケーの練習。",
        created_at=datetime(2026, 7, 19, 12, 35, tzinfo=UTC),  # 21:35 JST
        attachments=[],
    )
    defaults.update(overrides)
    return IncomingMessage(**defaults)


def test_should_process_ignores_bot_messages():
    config = _make_config()
    msg = _make_message(author_is_bot=True)
    assert should_process(config, msg) is False


def test_should_process_ignores_wrong_channel():
    config = _make_config()
    msg = _make_message(channel_id=999)
    assert should_process(config, msg) is False


def test_should_process_ignores_wrong_guild():
    config = _make_config()
    msg = _make_message(guild_id=999)
    assert should_process(config, msg) is False


def test_should_process_ignores_empty_message():
    config = _make_config()
    msg = _make_message(content="", attachments=[])
    assert should_process(config, msg) is False


def test_should_process_ignores_disallowed_user():
    config = _make_config(allowed_discord_user_ids=frozenset({42}))
    msg = _make_message(author_id=1)
    assert should_process(config, msg) is False


def test_should_process_allows_valid_message():
    config = _make_config()
    msg = _make_message()
    assert should_process(config, msg) is True


def test_describe_rejection_returns_none_for_valid_message():
    assert describe_rejection(_make_config(), _make_message()) is None


def test_describe_rejection_reports_wrong_channel_with_both_ids():
    config = _make_config()
    reason = describe_rejection(config, _make_message(channel_id=999))
    assert "999" in reason
    assert "222" in reason
    assert "チャンネル" in reason


def test_describe_rejection_reports_wrong_guild_with_both_ids():
    config = _make_config()
    reason = describe_rejection(config, _make_message(guild_id=999))
    assert "999" in reason
    assert "111" in reason
    assert "サーバー" in reason


def test_describe_rejection_reports_disallowed_user():
    config = _make_config(allowed_discord_user_ids=frozenset({42}))
    reason = describe_rejection(config, _make_message(author_id=1))
    assert "ユーザー" in reason


def test_describe_rejection_mentions_message_content_intent_when_empty():
    reason = describe_rejection(_make_config(), _make_message(content="", attachments=[]))
    assert "Message Content Intent" in reason


def test_filter_image_attachments_keeps_only_supported_types():
    attachments = [
        IncomingAttachment("photo.jpg", "image/jpeg", 100, "http://x/photo.jpg"),
        IncomingAttachment("doc.pdf", "application/pdf", 100, "http://x/doc.pdf"),
        IncomingAttachment("anim.gif", "image/gif", 100, "http://x/anim.gif"),
    ]
    result = filter_image_attachments(attachments)
    assert [a.filename for a in result] == ["photo.jpg", "anim.gif"]


def test_build_success_reply_with_images():
    assert build_success_reply(2) == (
        "✅ ライフログを保存しました\n文章：GitHub\n画像：Cloudflare R2（2件）"
    )


def test_build_success_reply_without_images():
    assert build_success_reply(0) == "✅ ライフログをGitHubへ保存しました"


def test_build_failure_reply_basic():
    assert build_failure_reply("GitHub保存") == "❌ 保存に失敗しました\n処理段階：GitHub保存"


def test_build_image_url_reply_includes_key_url_and_minutes():
    reply = build_image_url_reply(
        "images/2026/07/26/123-photo.png", 300, "https://signed.example/photo"
    )
    assert "約5分" in reply
    assert "`images/2026/07/26/123-photo.png`" in reply
    assert "https://signed.example/photo" in reply


def test_build_image_url_reply_rounds_up_short_expiry_to_one_minute():
    reply = build_image_url_reply("images/2026/07/26/123-photo.png", 20, "https://x/y")
    assert "約1分" in reply


def test_build_failure_reply_with_detail():
    reply = build_failure_reply("R2アップロード", "理由: サイズ超過")
    assert reply == "❌ 保存に失敗しました\n処理段階：R2アップロード\n理由: サイズ超過"


@pytest.mark.asyncio
async def test_process_message_ignored_returns_none():
    config = _make_config()
    msg = _make_message(content="", attachments=[])
    github_service = MagicMock()
    r2_service = MagicMock()

    async def downloader(url, max_bytes):
        return b"data"

    result = await process_message(msg, config, github_service, r2_service, downloader)
    assert result is None
    github_service.save_entry.assert_not_called()
    r2_service.upload_bytes.assert_not_called()


@pytest.mark.asyncio
async def test_process_message_text_only_success():
    config = _make_config()
    msg = _make_message()
    github_service = MagicMock()
    r2_service = MagicMock()

    async def downloader(url, max_bytes):
        return b"data"

    result = await process_message(msg, config, github_service, r2_service, downloader)

    assert result.success is True
    assert result.reply == "✅ ライフログをGitHubへ保存しました"
    github_service.save_entry.assert_called_once()
    r2_service.upload_bytes.assert_not_called()
    r2_service.delete_objects.assert_not_called()


@pytest.mark.asyncio
async def test_process_message_with_images_uploads_then_saves():
    config = _make_config()
    attachment = IncomingAttachment("photo.jpg", "image/jpeg", 100, "http://x/photo.jpg")
    msg = _make_message(attachments=[attachment])
    github_service = MagicMock()
    r2_service = MagicMock()

    async def downloader(url, max_bytes):
        return b"imagedata"

    result = await process_message(msg, config, github_service, r2_service, downloader)

    assert result.success is True
    assert "画像：Cloudflare R2（1件）" in result.reply
    r2_service.upload_bytes.assert_called_once()
    key_arg = r2_service.upload_bytes.call_args[0][0]
    assert key_arg == "images/2026/07/19/123456789-photo.jpg"
    github_service.save_entry.assert_called_once()
    saved_entry = github_service.save_entry.call_args[0][1]
    assert saved_entry.r2_keys == [key_arg]
    r2_service.delete_objects.assert_not_called()


@pytest.mark.asyncio
async def test_process_message_rejects_oversized_attachment_without_upload():
    config = _make_config(max_attachment_size_mb=1)
    too_big = 2 * 1024 * 1024
    attachment = IncomingAttachment("photo.jpg", "image/jpeg", too_big, "http://x/photo.jpg")
    msg = _make_message(attachments=[attachment])
    github_service = MagicMock()
    r2_service = MagicMock()

    async def downloader(url, max_bytes):
        raise AssertionError("should not download oversized attachment")

    result = await process_message(msg, config, github_service, r2_service, downloader)

    assert result.success is False
    assert "R2アップロード" in result.reply
    r2_service.upload_bytes.assert_not_called()
    github_service.save_entry.assert_not_called()


@pytest.mark.asyncio
async def test_process_message_rolls_back_previous_uploads_on_later_failure():
    config = _make_config()
    ok_attachment = IncomingAttachment("a.jpg", "image/jpeg", 100, "http://x/a.jpg")
    bad_attachment = IncomingAttachment("b.jpg", "image/jpeg", 100, "http://x/b.jpg")
    msg = _make_message(attachments=[ok_attachment, bad_attachment])
    github_service = MagicMock()
    r2_service = MagicMock()

    async def downloader(url, max_bytes):
        if "b.jpg" in url:
            raise AttachmentDownloadError("boom")
        return b"data"

    result = await process_message(msg, config, github_service, r2_service, downloader)

    assert result.success is False
    assert "R2アップロード" in result.reply
    github_service.save_entry.assert_not_called()
    r2_service.delete_objects.assert_called_once()
    rolled_back_keys = r2_service.delete_objects.call_args[0][0]
    assert rolled_back_keys == ["images/2026/07/19/123456789-a.jpg"]


@pytest.mark.asyncio
async def test_process_message_rolls_back_r2_on_github_failure():
    config = _make_config()
    attachment = IncomingAttachment("photo.jpg", "image/jpeg", 100, "http://x/photo.jpg")
    msg = _make_message(attachments=[attachment])
    github_service = MagicMock()
    github_service.save_entry.side_effect = GitHubSaveError("boom")
    r2_service = MagicMock()

    async def downloader(url, max_bytes):
        return b"data"

    result = await process_message(msg, config, github_service, r2_service, downloader)

    assert result.success is False
    assert "GitHub保存" in result.reply
    r2_service.delete_objects.assert_called_once_with(["images/2026/07/19/123456789-photo.jpg"])


def test_is_task_command_detects_prefix():
    assert is_task_command("!task 牛乳を買う") is True
    assert is_task_command("  !task 牛乳を買う  ") is True
    assert is_task_command("!TASK 牛乳を買う") is True
    assert is_task_command("!task") is True


def test_is_task_command_rejects_non_commands():
    assert is_task_command("今日は !task について考えた") is False
    assert is_task_command("!taskfoo 牛乳") is False
    assert is_task_command("普通の日記") is False


def test_parse_task_text_strips_prefix_and_whitespace():
    assert parse_task_text("!task  牛乳を買う  ") == "牛乳を買う"
    assert parse_task_text("!task 牛乳を買う\n低脂肪のもの") == "牛乳を買う\n低脂肪のもの"
    assert parse_task_text("!task") == ""


def test_task_channel_id_falls_back_to_daily_channel():
    assert task_channel_id(_make_config(discord_task_channel_id=None)) == 222
    assert task_channel_id(_make_config(discord_task_channel_id=333)) == 333


def test_task_command_is_excluded_from_diary_saving():
    config = _make_config()
    msg = _make_message(content="!task 牛乳を買う")
    assert should_process(config, msg) is False
    assert "!task" in describe_rejection(config, msg)


@pytest.mark.asyncio
async def test_process_task_command_creates_issue():
    config = _make_config()
    msg = _make_message(content="!task 牛乳を買う")
    github_service = MagicMock()
    github_service.create_issue.return_value = MagicMock(
        number=7, url="https://github.com/owner/repo/issues/7"
    )

    result = await process_task_command(msg, config, github_service)

    assert result.success is True
    assert "#7" in result.reply
    assert "牛乳を買う" in result.reply
    assert "https://github.com/owner/repo/issues/7" in result.reply
    task_arg = github_service.create_issue.call_args[0][0]
    assert task_arg.text == "牛乳を買う"
    assert task_arg.message_id == 123456789
    assert task_arg.iso_datetime.endswith("+09:00")


@pytest.mark.asyncio
async def test_process_task_command_returns_usage_when_text_empty():
    config = _make_config()
    msg = _make_message(content="!task")
    github_service = MagicMock()

    result = await process_task_command(msg, config, github_service)

    assert result.success is False
    assert "内容が空です" in result.reply
    github_service.create_issue.assert_not_called()


@pytest.mark.asyncio
async def test_process_task_command_reports_failure_stage():
    config = _make_config()
    msg = _make_message(content="!task 牛乳を買う")
    github_service = MagicMock()
    github_service.create_issue.side_effect = GitHubIssueError("boom")

    result = await process_task_command(msg, config, github_service)

    assert result.success is False
    assert "GitHub Issue作成" in result.reply


@pytest.mark.asyncio
async def test_process_task_command_ignores_unrelated_channel():
    config = _make_config(discord_task_channel_id=333)
    msg = _make_message(content="!task 牛乳を買う", channel_id=999)
    github_service = MagicMock()

    assert await process_task_command(msg, config, github_service) is None
    github_service.create_issue.assert_not_called()


@pytest.mark.asyncio
async def test_task_prefix_in_daily_still_accepted_with_task_channel_configured():
    """Configuring a task channel adds a second entry point; it does not
    take !task away from #daily."""
    config = _make_config(discord_task_channel_id=333)
    msg = _make_message(content="!task 牛乳を買う", channel_id=222)
    github_service = MagicMock()
    github_service.create_issue.return_value = MagicMock(number=4, url="https://x/4")

    result = await process_task_command(msg, config, github_service)

    assert result.success is True
    assert github_service.create_issue.call_args[0][0].text == "牛乳を買う"


@pytest.mark.asyncio
async def test_process_task_command_ignores_disallowed_user():
    config = _make_config(allowed_discord_user_ids=frozenset({42}))
    msg = _make_message(content="!task 牛乳を買う", author_id=1)
    github_service = MagicMock()

    assert await process_task_command(msg, config, github_service) is None
    github_service.create_issue.assert_not_called()


def test_notification_channel_id_falls_back_to_daily_channel():
    assert notification_channel_id(_make_config(notification_channel_id=None)) == 222
    assert notification_channel_id(_make_config(notification_channel_id=555)) == 555


TASK_CHANNEL = 333


def test_dedicated_task_channel_requires_explicit_config():
    # Without DISCORD_TASK_CHANNEL_ID the fallback is #daily, which must
    # never swallow diary posts as tasks.
    assert is_dedicated_task_channel(_make_config(discord_task_channel_id=None), 222) is False
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    assert is_dedicated_task_channel(config, TASK_CHANNEL) is True
    assert is_dedicated_task_channel(config, 222) is False


def test_plain_post_in_task_channel_is_a_task():
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    msg = _make_message(channel_id=TASK_CHANNEL, content="牛乳を買う")
    assert is_task_message(config, msg) is True
    assert task_text_of(config, msg) == "牛乳を買う"


def test_task_prefix_still_works_in_task_channel():
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    msg = _make_message(channel_id=TASK_CHANNEL, content="!task 牛乳を買う")
    assert is_task_message(config, msg) is True
    assert task_text_of(config, msg) == "牛乳を買う"


def test_plain_post_in_daily_channel_is_not_a_task():
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    msg = _make_message(channel_id=222, content="今日はホッケーの練習。")
    assert is_task_message(config, msg) is False


def test_task_prefix_in_daily_channel_is_still_a_task():
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    msg = _make_message(channel_id=222, content="!task 牛乳を買う")
    assert is_task_message(config, msg) is True


def test_diary_post_is_not_a_task_when_no_task_channel_configured():
    config = _make_config(discord_task_channel_id=None)
    assert is_task_message(config, _make_message(content="今日の記録")) is False


def test_empty_post_in_task_channel_is_not_a_task():
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    msg = _make_message(channel_id=TASK_CHANNEL, content="   ")
    assert is_task_message(config, msg) is False


def test_accepted_task_channels_includes_both():
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    assert accepted_task_channels(config) == {222, TASK_CHANNEL}
    assert accepted_task_channels(_make_config()) == {222}


@pytest.mark.asyncio
async def test_process_task_command_accepts_plain_post_in_task_channel():
    config = _make_config(discord_task_channel_id=TASK_CHANNEL)
    msg = _make_message(channel_id=TASK_CHANNEL, content="牛乳を買う")
    github_service = MagicMock()
    github_service.create_issue.return_value = MagicMock(number=9, url="https://x/9")

    result = await process_task_command(msg, config, github_service)

    assert result.success is True
    assert github_service.create_issue.call_args[0][0].text == "牛乳を買う"


@pytest.mark.asyncio
async def test_process_message_records_weather():
    config = _make_config()
    msg = _make_message()
    github_service = MagicMock()

    class FakeWeather:
        async def current_weather(self):
            return "晴れ 24.5℃"

    async def downloader(url, max_bytes):
        return b"data"

    result = await process_message(
        msg, config, github_service, MagicMock(), downloader, FakeWeather()
    )

    assert result.success is True
    assert github_service.save_entry.call_args[0][1].weather == "晴れ 24.5℃"


@pytest.mark.asyncio
async def test_process_message_saves_without_weather_when_lookup_fails():
    """A weather outage must not cost the entry."""
    config = _make_config()
    msg = _make_message()
    github_service = MagicMock()

    class FailingWeather:
        async def current_weather(self):
            return None

    async def downloader(url, max_bytes):
        return b"data"

    result = await process_message(
        msg, config, github_service, MagicMock(), downloader, FailingWeather()
    )

    assert result.success is True
    assert github_service.save_entry.call_args[0][1].weather is None


class _FakeTagger:
    """Stands in for a summarizer, which is what produces tags."""

    def __init__(self, reply="運動 健康"):
        self.reply = reply

    async def summarize(self, entries, *args, **kwargs):
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


async def _downloader(url, max_bytes):
    return b"data"


@pytest.mark.asyncio
async def test_process_message_tags_the_entry_when_enabled():
    config = _make_config(tagging_enabled=True)
    github_service = MagicMock()

    result = await process_message(
        _make_message(), config, github_service, MagicMock(), _downloader, None, _FakeTagger()
    )

    assert result.success is True
    assert github_service.save_entry.call_args[0][1].tags == ["運動", "健康"]


@pytest.mark.asyncio
async def test_process_message_skips_tagging_when_disabled():
    config = _make_config(tagging_enabled=False)
    github_service = MagicMock()

    await process_message(
        _make_message(), config, github_service, MagicMock(), _downloader, None, _FakeTagger()
    )

    assert github_service.save_entry.call_args[0][1].tags == []


@pytest.mark.asyncio
async def test_process_message_saves_untagged_when_the_model_fails():
    """Tagging is a bonus — a model outage must not cost the entry."""
    config = _make_config(tagging_enabled=True)
    github_service = MagicMock()

    result = await process_message(
        _make_message(),
        config,
        github_service,
        MagicMock(),
        _downloader,
        None,
        _FakeTagger(RuntimeError("model down")),
    )

    assert result.success is True
    assert github_service.save_entry.call_args[0][1].tags == []


@pytest.mark.asyncio
async def test_process_message_indexes_the_saved_entry():
    config = _make_config()
    index = SearchIndex(":memory:")
    try:
        result = await process_message(
            _make_message(),
            config,
            MagicMock(),
            MagicMock(),
            _downloader,
            None,
            None,
            index,
        )
        assert result.success is True
        hits = index.search("ホッケー")
        assert [(hit.date_str, hit.time_str) for hit in hits] == [("2026-07-19", "21:35")]
    finally:
        index.close()


@pytest.mark.asyncio
async def test_process_message_does_not_index_a_failed_save():
    config = _make_config()
    github_service = MagicMock()
    github_service.save_entry.side_effect = GitHubSaveError("boom")
    index = SearchIndex(":memory:")
    try:
        result = await process_message(
            _make_message(), config, github_service, MagicMock(), _downloader, None, None, index
        )
        assert result.success is False
        assert index.count() == 0
    finally:
        index.close()


@pytest.mark.asyncio
async def test_process_message_survives_a_broken_index():
    """The index is a cache of GitHub; losing it must not lose the entry."""
    config = _make_config()
    index = MagicMock()
    index.index_entry.side_effect = RuntimeError("disk full")

    result = await process_message(
        _make_message(), config, MagicMock(), MagicMock(), _downloader, None, None, index
    )

    assert result.success is True


def test_open_search_index_returns_none_when_disabled():
    assert open_search_index(_make_config(search_enabled=False)) is None


def test_open_search_index_returns_none_when_the_file_cannot_be_opened():
    """A broken index must leave the diary bot running."""
    config = _make_config(search_enabled=True, search_index_path="/proc/nope/search.db")
    assert open_search_index(config) is None


def test_build_search_reply_lists_hits_newest_first():
    hits = [
        SearchHit("2026-07-26", "09:00", "朝ラン5km", ["運動"], 0),
        SearchHit("2026-07-25", "20:00", "スーパーで買い物", ["買い物"], 1),
    ]
    reply = build_search_reply("ラン", None, hits)
    assert "2件" in reply
    assert reply.index("2026-07-26") < reply.index("2026-07-25")
    assert "#運動" in reply
    assert "📷1" in reply


def test_build_search_reply_reports_an_empty_result():
    assert "一致する記録はありません" in build_search_reply("ホッケー", None, [])


def test_build_search_reply_names_the_tag_filter():
    assert "タグ #運動" in build_search_reply("", "運動", [])


def test_build_search_reply_fits_in_one_discord_message():
    hits = [SearchHit("2026-07-26", "09:00", "あ" * 200, [], 0) for _ in range(50)]
    reply = build_search_reply("あ", None, hits)
    assert len(reply) <= 2000
    assert "ほか" in reply
