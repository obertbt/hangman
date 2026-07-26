from datetime import datetime
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from app.config import Config
from app.discord_handler import (
    AttachmentDownloadError,
    build_failure_reply,
    build_success_reply,
    describe_rejection,
    filter_image_attachments,
    process_message,
    should_process,
)
from app.github_service import GitHubSaveError
from app.models import IncomingAttachment, IncomingMessage

UTC = ZoneInfo("UTC")


def _make_config(**overrides) -> Config:
    defaults = dict(
        discord_bot_token="t",
        discord_guild_id=111,
        discord_daily_channel_id=222,
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
