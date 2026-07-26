"""Discord-facing glue: message filtering, orchestration, and the
discord.py client itself.

The orchestration logic (`process_message`) is written against the plain
`IncomingMessage` model rather than `discord.Message`, so it can be unit
tested without a real Discord connection. `LifelogClient` is the thin
adapter that turns real Discord events into that model.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Awaitable, Callable
from zoneinfo import ZoneInfo

import aiohttp
import discord

from app.config import Config, is_user_allowed
from app.github_service import GitHubSaveError, GitHubService
from app.models import IncomingAttachment, IncomingMessage, MarkdownEntryData, ProcessResult
from app.r2_service import (
    SUPPORTED_CONTENT_TYPES,
    R2Service,
    build_object_key,
    validate_object_key,
)

logger = logging.getLogger(__name__)

STAGE_R2_UPLOAD = "R2アップロード"
STAGE_GITHUB_SAVE = "GitHub保存"

# (data, content_type)
Downloader = Callable[[str, int], Awaitable[bytes]]


class AttachmentTooLargeError(Exception):
    pass


class AttachmentDownloadError(Exception):
    pass


def describe_rejection(config: Config, msg: IncomingMessage) -> str | None:
    """Return why this message is ignored, or None if it should be processed.

    The reason is logged so that a silently-ignored post (wrong channel ID,
    missing Message Content Intent, ...) can be diagnosed from the console.
    """
    if msg.author_is_bot:
        return "Botの投稿のため無視しました"
    if msg.guild_id != config.discord_guild_id:
        return (
            f"対象外のサーバーです（受信: {msg.guild_id} / 設定 DISCORD_GUILD_ID: "
            f"{config.discord_guild_id}）"
        )
    if msg.channel_id != config.discord_daily_channel_id:
        return (
            f"対象外のチャンネルです（受信: {msg.channel_id} / 設定 "
            f"DISCORD_DAILY_CHANNEL_ID: {config.discord_daily_channel_id}）"
        )
    if not is_user_allowed(config, msg.author_id):
        return (
            f"許可されていないユーザーです（受信: {msg.author_id} / 設定 "
            f"ALLOWED_DISCORD_USER_IDS: {sorted(config.allowed_discord_user_ids)}）"
        )
    if not msg.content.strip() and not msg.attachments:
        return (
            "本文も添付ファイルもありません。"
            "本文を書いたのにこの表示が出る場合は、Discord Developer Portalの "
            "Bot設定で Message Content Intent が有効か確認してください"
        )
    return None


def should_process(config: Config, msg: IncomingMessage) -> bool:
    return describe_rejection(config, msg) is None


def filter_image_attachments(attachments: list[IncomingAttachment]) -> list[IncomingAttachment]:
    return [att for att in attachments if att.content_type in SUPPORTED_CONTENT_TYPES]


def build_success_reply(image_count: int) -> str:
    if image_count == 0:
        return "✅ ライフログをGitHubへ保存しました"
    return (
        "✅ ライフログを保存しました\n"
        "文章：GitHub\n"
        f"画像：Cloudflare R2（{image_count}件）"
    )


def build_failure_reply(stage: str, detail: str | None = None) -> str:
    lines = ["❌ 保存に失敗しました", f"処理段階：{stage}"]
    if detail:
        lines.append(detail)
    return "\n".join(lines)


async def process_message(
    msg: IncomingMessage,
    config: Config,
    github_service: GitHubService,
    r2_service: R2Service,
    downloader: Downloader,
) -> ProcessResult | None:
    """Core orchestration, independent of discord.py.

    Returns None if the message should be ignored entirely (no reply).
    """
    rejection = describe_rejection(config, msg)
    if rejection is not None:
        logger.info("投稿を無視しました: message_id=%s 理由=%s", msg.message_id, rejection)
        return None

    jst = ZoneInfo(config.timezone)
    jst_dt = msg.created_at.astimezone(jst)
    images = filter_image_attachments(msg.attachments)

    uploaded_keys: list[str] = []
    for attachment in images:
        if attachment.size > config.max_attachment_size_bytes:
            r2_service.delete_objects(uploaded_keys)
            return ProcessResult(
                False,
                build_failure_reply(
                    STAGE_R2_UPLOAD,
                    f"理由: ファイルサイズが上限（{config.max_attachment_size_mb}MB）を"
                    f"超えています（{attachment.filename}）",
                ),
            )

        key = build_object_key(jst_dt, msg.message_id, attachment.filename)
        try:
            data = await downloader(attachment.url, config.max_attachment_size_bytes)
            r2_service.upload_bytes(key, data, attachment.content_type or "application/octet-stream")
        except Exception:
            logger.exception("R2アップロードに失敗しました: message_id=%s key=%s", msg.message_id, key)
            r2_service.delete_objects(uploaded_keys)
            return ProcessResult(False, build_failure_reply(STAGE_R2_UPLOAD))
        uploaded_keys.append(key)

    entry = MarkdownEntryData(
        time_str=f"{jst_dt:%H:%M}",
        content=msg.content,
        author_name=msg.author_display_name,
        author_id=msg.author_id,
        message_id=msg.message_id,
        iso_datetime=jst_dt.isoformat(),
        r2_keys=uploaded_keys,
    )

    try:
        github_service.save_entry(jst_dt, entry)
    except GitHubSaveError:
        logger.exception("GitHubへの保存に失敗しました: message_id=%s", msg.message_id)
        r2_service.delete_objects(uploaded_keys)
        return ProcessResult(False, build_failure_reply(STAGE_GITHUB_SAVE))
    except Exception:
        logger.exception("GitHubへの保存中に想定外のエラーが発生しました: message_id=%s", msg.message_id)
        r2_service.delete_objects(uploaded_keys)
        return ProcessResult(False, build_failure_reply(STAGE_GITHUB_SAVE))

    return ProcessResult(True, build_success_reply(len(uploaded_keys)))


def to_incoming_message(message: discord.Message) -> IncomingMessage:
    attachments = [
        IncomingAttachment(
            filename=att.filename,
            content_type=att.content_type,
            size=att.size,
            url=att.url,
        )
        for att in message.attachments
    ]
    return IncomingMessage(
        guild_id=message.guild.id if message.guild else 0,
        channel_id=message.channel.id,
        author_id=message.author.id,
        author_display_name=getattr(message.author, "display_name", str(message.author)),
        author_is_bot=bool(message.author.bot),
        message_id=message.id,
        content=message.content or "",
        created_at=message.created_at,
        attachments=attachments,
    )


def build_image_url_reply(key: str, expiry_seconds: int, url: str) -> str:
    minutes = max(1, round(expiry_seconds / 60))
    return (
        f"🔗 一時閲覧URLを発行しました（約{minutes}分で失効します）\n"
        f"R2キー: `{key}`\n"
        f"{url}"
    )


class LifelogClient(discord.Client):
    def __init__(
        self,
        config: Config,
        github_service: GitHubService,
        r2_service: R2Service,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.config = config
        self.github_service = github_service
        self.r2_service = r2_service
        self._http_session: aiohttp.ClientSession | None = None
        self.tree = discord.app_commands.CommandTree(self)
        self._register_commands()

    def _register_commands(self) -> None:
        guild = discord.Object(id=self.config.discord_guild_id)

        @self.tree.command(
            name="image",
            description="ライフログ画像の一時閲覧URLを発行します（自分にだけ表示されます）",
            guild=guild,
        )
        @discord.app_commands.describe(
            key="GitHubの日記に記録されたR2キー（例: images/2026/07/26/123-photo.png）"
        )
        async def image_command(interaction: discord.Interaction, key: str) -> None:
            await self._handle_image_command(interaction, key)

    async def setup_hook(self) -> None:
        self._http_session = aiohttp.ClientSession()
        guild = discord.Object(id=self.config.discord_guild_id)
        try:
            await self.tree.sync(guild=guild)
        except Exception:
            logger.exception(
                "スラッシュコマンドの登録に失敗しました。Botの招待URLに "
                "applications.commands スコープが含まれているか確認してください。"
            )

    async def close(self) -> None:
        if self._http_session is not None:
            await self._http_session.close()
        await super().close()

    async def on_ready(self):
        logger.info("Logged in as %s (ID: %s)", self.user, self.user.id if self.user else "?")
        logger.info(
            "監視対象: サーバーID=%s / チャンネルID=%s",
            self.config.discord_guild_id,
            self.config.discord_daily_channel_id,
        )
        guild = self.get_guild(self.config.discord_guild_id)
        if guild is None:
            logger.warning(
                "設定された DISCORD_GUILD_ID のサーバーが見つかりません。"
                "IDが正しいか、Botがそのサーバーに参加しているか確認してください。"
            )
        else:
            channel = guild.get_channel(self.config.discord_daily_channel_id)
            if channel is None:
                logger.warning(
                    "サーバー「%s」内に DISCORD_DAILY_CHANNEL_ID のチャンネルが見つかりません。"
                    "IDが正しいか、BotにView Channel権限があるか確認してください。",
                    guild.name,
                )
            else:
                logger.info("監視チャンネルを確認しました: #%s（%s）", channel.name, guild.name)

    async def on_message(self, message: discord.Message) -> None:
        if self.user is not None and message.author.id == self.user.id:
            return

        logger.info(
            "メッセージ受信: guild=%s channel=%s author=%s 本文の長さ=%s 添付=%s件",
            message.guild.id if message.guild else None,
            message.channel.id,
            message.author.id,
            len(message.content or ""),
            len(message.attachments),
        )

        incoming = to_incoming_message(message)
        try:
            result = await process_message(
                incoming, self.config, self.github_service, self.r2_service, self._download_attachment
            )
        except Exception:
            logger.exception("メッセージ処理中に想定外のエラーが発生しました: message_id=%s", message.id)
            return

        if result is None:
            return
        await message.reply(result.reply)

    async def _handle_image_command(self, interaction: discord.Interaction, key: str) -> None:
        # The signed URL is a credential, so every response stays ephemeral.
        if not is_user_allowed(self.config, interaction.user.id):
            await interaction.response.send_message(
                "❌ このコマンドを使用する権限がありません。", ephemeral=True
            )
            return

        key = key.strip()
        error = validate_object_key(key)
        if error is not None:
            await interaction.response.send_message(f"❌ {error}", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        try:
            exists = await asyncio.to_thread(self.r2_service.object_exists, key)
            if not exists:
                await interaction.followup.send(
                    f"❌ 指定された画像がR2に見つかりません。\nR2キー: `{key}`", ephemeral=True
                )
                return
            url = await asyncio.to_thread(
                self.r2_service.generate_presigned_url,
                key,
                self.config.signed_url_expiry_seconds,
            )
        except Exception:
            # Never log the URL itself; the traceback is safe to record.
            logger.exception("署名付きURLの発行に失敗しました: key=%s", key)
            await interaction.followup.send(
                "❌ 一時閲覧URLの発行に失敗しました。ログを確認してください。", ephemeral=True
            )
            return

        logger.info(
            "一時閲覧URLを発行しました: key=%s user=%s 有効期間=%s秒",
            key,
            interaction.user.id,
            self.config.signed_url_expiry_seconds,
        )
        await interaction.followup.send(
            build_image_url_reply(key, self.config.signed_url_expiry_seconds, url),
            ephemeral=True,
        )

    async def _download_attachment(self, url: str, max_bytes: int) -> bytes:
        assert self._http_session is not None
        try:
            async with self._http_session.get(url) as response:
                response.raise_for_status()
                content_length = response.headers.get("Content-Length")
                if content_length is not None and int(content_length) > max_bytes:
                    raise AttachmentTooLargeError("attachment exceeds max size")

                chunks = bytearray()
                async for chunk in response.content.iter_chunked(64 * 1024):
                    chunks.extend(chunk)
                    if len(chunks) > max_bytes:
                        raise AttachmentTooLargeError("attachment exceeds max size")
                return bytes(chunks)
        except AttachmentTooLargeError:
            raise
        except Exception as exc:
            raise AttachmentDownloadError(str(exc)) from exc


def create_client(config: Config, github_service: GitHubService, r2_service: R2Service) -> LifelogClient:
    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    return LifelogClient(config, github_service, r2_service, intents=intents)
