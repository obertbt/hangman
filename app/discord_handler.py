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
from discord.ext import tasks

from app.config import Config, is_user_allowed
from app.github_service import (
    GitHubSaveError,
    GitHubService,
    build_issue_title,
    count_entry_headings,
    extract_entry_bodies,
)
from app.models import (
    IncomingAttachment,
    IncomingMessage,
    MarkdownEntryData,
    ProcessResult,
    TaskData,
)
from app.notifications import MAX_LISTED_ISSUES, build_evening_message, build_morning_message
from app.periodic_summary import (
    build_notification,
    build_summary_input,
    build_summary_markdown,
    collect_stats,
    due_periods,
)
from app.summary_service import (
    MAX_PERIOD_SUMMARY_LENGTH,
    PERIOD_SYSTEM_PROMPT,
    Summarizer,
    create_summarizer,
    period_prompt_heading,
    summarize_entries,
)
from app.weather_service import WeatherService
from app.r2_service import (
    SUPPORTED_CONTENT_TYPES,
    R2Service,
    build_object_key,
    describe_usage,
    validate_object_key,
)

logger = logging.getLogger(__name__)

STAGE_R2_UPLOAD = "R2アップロード"
STAGE_GITHUB_SAVE = "GitHub保存"
STAGE_GITHUB_ISSUE = "GitHub Issue作成"

TASK_COMMAND_PREFIX = "!task"

# (data, content_type)
Downloader = Callable[[str, int], Awaitable[bytes]]


class AttachmentTooLargeError(Exception):
    pass


class AttachmentDownloadError(Exception):
    pass


def is_task_command(content: str) -> bool:
    stripped = content.strip()
    if not stripped.lower().startswith(TASK_COMMAND_PREFIX):
        return False
    # "!taskfoo" must not count as the command.
    remainder = stripped[len(TASK_COMMAND_PREFIX) :]
    return remainder == "" or remainder[0].isspace()


def parse_task_text(content: str) -> str:
    """Text following the !task prefix, with surrounding whitespace removed."""
    return content.strip()[len(TASK_COMMAND_PREFIX) :].strip()


def task_channel_id(config: Config) -> int:
    """!task listens on its own channel when configured, else on #daily."""
    if config.discord_task_channel_id is not None:
        return config.discord_task_channel_id
    return config.discord_daily_channel_id


def is_dedicated_task_channel(config: Config, channel_id: int) -> bool:
    """True only for an explicitly configured task channel.

    Without DISCORD_TASK_CHANNEL_ID the task channel falls back to
    #daily, where treating every post as a task would turn the diary
    into Issues — so the fallback must never count as dedicated.
    """
    return (
        config.discord_task_channel_id is not None
        and channel_id == config.discord_task_channel_id
    )


def accepted_task_channels(config: Config) -> set[int]:
    channels = {config.discord_daily_channel_id}
    if config.discord_task_channel_id is not None:
        channels.add(config.discord_task_channel_id)
    return channels


def is_task_message(config: Config, msg: IncomingMessage) -> bool:
    """In a dedicated task channel every post is a task; elsewhere the
    !task prefix is what marks one.
    """
    if is_dedicated_task_channel(config, msg.channel_id):
        return bool(msg.content.strip())
    return is_task_command(msg.content)


def task_text_of(config: Config, msg: IncomingMessage) -> str:
    """The task body, with the !task prefix stripped when present."""
    if is_task_command(msg.content):
        return parse_task_text(msg.content)
    return msg.content.strip()


def describe_task_rejection(config: Config, msg: IncomingMessage) -> str | None:
    if msg.author_is_bot:
        return "Botの投稿のため無視しました"
    if msg.guild_id != config.discord_guild_id:
        return (
            f"対象外のサーバーです（受信: {msg.guild_id} / 設定 DISCORD_GUILD_ID: "
            f"{config.discord_guild_id}）"
        )
    accepted = accepted_task_channels(config)
    if msg.channel_id not in accepted:
        return (
            f"タスクの対象外チャンネルです（受信: {msg.channel_id} / 対象: {sorted(accepted)}）"
        )
    if not is_user_allowed(config, msg.author_id):
        return f"許可されていないユーザーです（受信: {msg.author_id}）"
    return None


def build_issue_success_reply(number: int, title: str, url: str) -> str:
    return f"✅ GitHub Issueを作成しました\n#{number} {title}\n{url}"


def build_task_usage_reply() -> str:
    return (
        "⚠️ タスクの内容が空です\n"
        f"`{TASK_COMMAND_PREFIX} 牛乳を買う` のように、コマンドの後ろに内容を書いてください。"
    )


def describe_rejection(config: Config, msg: IncomingMessage) -> str | None:
    """Return why this message is ignored, or None if it should be processed.

    The reason is logged so that a silently-ignored post (wrong channel ID,
    missing Message Content Intent, ...) can be diagnosed from the console.
    """
    if msg.author_is_bot:
        return "Botの投稿のため無視しました"
    if is_task_command(msg.content):
        return "!taskコマンドのため、日記への保存対象外です"
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
    weather_service: WeatherService | None = None,
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

    # Best effort: a weather lookup must never block saving the entry.
    weather = await weather_service.current_weather() if weather_service else None

    entry = MarkdownEntryData(
        time_str=f"{jst_dt:%H:%M}",
        content=msg.content,
        author_name=msg.author_display_name,
        author_id=msg.author_id,
        message_id=msg.message_id,
        iso_datetime=jst_dt.isoformat(),
        r2_keys=uploaded_keys,
        weather=weather,
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


async def process_task_command(
    msg: IncomingMessage,
    config: Config,
    github_service: GitHubService,
) -> ProcessResult | None:
    """Turn a !task post into a GitHub Issue.

    Returns None if the message should be ignored entirely (no reply).
    """
    rejection = describe_task_rejection(config, msg)
    if rejection is not None:
        logger.info("!taskを無視しました: message_id=%s 理由=%s", msg.message_id, rejection)
        return None

    text = task_text_of(config, msg)
    if not text:
        return ProcessResult(False, build_task_usage_reply())

    jst_dt = msg.created_at.astimezone(ZoneInfo(config.timezone))
    task = TaskData(
        text=text,
        author_name=msg.author_display_name,
        author_id=msg.author_id,
        message_id=msg.message_id,
        iso_datetime=jst_dt.isoformat(),
    )

    try:
        issue = await asyncio.to_thread(github_service.create_issue, task)
    except Exception:
        logger.exception("GitHub Issueの作成に失敗しました: message_id=%s", msg.message_id)
        return ProcessResult(False, build_failure_reply(STAGE_GITHUB_ISSUE))

    logger.info("GitHub Issueを作成しました: #%s message_id=%s", issue.number, msg.message_id)
    return ProcessResult(
        True, build_issue_success_reply(issue.number, build_issue_title(text), issue.url)
    )


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


def notification_channel_id(config: Config) -> int:
    """Notifications go to their own channel when configured, else #daily."""
    if config.notification_channel_id is not None:
        return config.notification_channel_id
    return config.discord_daily_channel_id


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
        summarizer: Summarizer | None = None,
        weather_service: WeatherService | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.config = config
        self.github_service = github_service
        self.r2_service = r2_service
        self.summarizer = summarizer if summarizer is not None else create_summarizer(config)
        self.weather_service = (
            weather_service if weather_service is not None else WeatherService(config)
        )
        self._http_session: aiohttp.ClientSession | None = None
        self.tree = discord.app_commands.CommandTree(self)
        self._register_commands()
        self._notification_loops: list[tasks.Loop] = []
        self._healthcheck_loop: tasks.Loop | None = None
        self._periodic_summary_loop: tasks.Loop | None = None
        self._web_server = None
        self._web_task: asyncio.Task | None = None

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
        self._start_notification_loops()
        self._start_periodic_summary_loop()
        self._start_healthcheck_loop()
        self._start_web_server()

    def _start_periodic_summary_loop(self) -> None:
        at_time = self.config.periodic_summary_time
        if not self.config.periodic_summary_enabled or at_time is None:
            logger.info("週次・月次まとめは無効です（PERIODIC_SUMMARY_ENABLED=false）")
            return
        loop = tasks.loop(time=at_time)(self._run_due_periodic_summaries)
        loop.start()
        self._periodic_summary_loop = loop
        logger.info(
            "週次・月次まとめを %02d:%02d に確認します（月曜=週次 / 1日=月次）",
            at_time.hour,
            at_time.minute,
        )

    async def _run_due_periodic_summaries(self) -> None:
        await self.wait_until_ready()
        today = datetime.now(ZoneInfo(self.config.timezone)).date()
        for period in due_periods(today):
            try:
                await self._generate_period_summary(period)
            except Exception:
                # One failed roll-up must not stop the other.
                logger.exception("まとめの作成に失敗しました: %s", period.label)

    async def _generate_period_summary(self, period) -> None:
        entries_by_day = await asyncio.to_thread(
            self.github_service.fetch_entries_in_range, period.start, period.end
        )
        stats = collect_stats(entries_by_day)

        summary_text = await summarize_entries(
            self.summarizer,
            build_summary_input(entries_by_day, self.config.periodic_summary_max_input_chars),
            PERIOD_SYSTEM_PROMPT,
            MAX_PERIOD_SUMMARY_LENGTH,
            period_prompt_heading(period.label),
        )
        usage = await self._storage_usage() if period.kind == "monthly" else None

        markdown = build_summary_markdown(period, stats, summary_text, usage)
        await asyncio.to_thread(
            self.github_service.save_summary,
            period.path,
            markdown,
            f"Add {period.kind} summary for {period.label}",
        )
        logger.info(
            "まとめを保存しました: %s（%s日 / %s件）",
            period.path,
            stats.day_count,
            stats.entry_count,
        )

        channel = await self._notification_channel()
        if channel is not None:
            url = (
                f"https://github.com/{self.config.github_owner}/"
                f"{self.config.github_repo}/blob/{self.config.github_branch}/{period.path}"
            )
            await channel.send(build_notification(period, stats, url))

    async def _storage_usage(self) -> str | None:
        """Bucket usage for the monthly roll-up; None if unavailable."""
        if not self.config.report_storage_usage:
            return None
        try:
            count, total = await asyncio.to_thread(self.r2_service.calculate_usage)
        except Exception:
            logger.exception("R2使用量の取得に失敗しました")
            return None
        return describe_usage(count, total)

    def _start_healthcheck_loop(self) -> None:
        """Ping an external monitor so a stalled bot is noticed.

        Nothing else reports downtime: if the machine reboots and the bot
        fails to come back, the only symptom is notifications quietly not
        arriving. A monitor that alerts on *missing* pings covers that.
        """
        url = self.config.healthcheck_url
        if not url:
            logger.info("死活監視は無効です（HEALTHCHECK_URL 未設定）")
            return

        @tasks.loop(minutes=self.config.healthcheck_interval_minutes)
        async def ping() -> None:
            assert self._http_session is not None
            try:
                async with self._http_session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
                    r.raise_for_status()
            except Exception:
                # Losing a ping is not worth stopping the bot over.
                logger.warning("死活監視のpingに失敗しました", exc_info=True)

        @ping.before_loop
        async def before_ping() -> None:
            await self.wait_until_ready()

        ping.start()
        self._healthcheck_loop = ping
        logger.info(
            "死活監視を有効にしました（%s分ごと）", self.config.healthcheck_interval_minutes
        )

    def _start_web_server(self) -> None:
        if not self.config.web_enabled:
            logger.info("Web画面は無効です（WEB_ENABLED=false）")
            return
        # Imported here so the web dependencies are only needed when enabled.
        import uvicorn

        from app.web_app import create_app

        server = uvicorn.Server(
            uvicorn.Config(
                create_app(self.config, self.github_service, self.r2_service),
                host=self.config.web_host,
                port=self.config.web_port,
                log_level="warning",
                access_log=False,
            )
        )
        self._web_server = server

        async def run() -> None:
            try:
                await server.serve()
            except Exception:
                # The diary bot keeps working even if the viewer dies.
                logger.exception("Webサーバーが停止しました")

        self._web_task = asyncio.create_task(run())
        logger.info(
            "Web画面を起動しました: http://%s:%s",
            self.config.web_host,
            self.config.web_port,
        )

    def _start_notification_loops(self) -> None:
        schedule = [
            ("朝", self.config.morning_notification_time, self._send_morning_notification),
            ("夜", self.config.evening_notification_time, self._send_evening_notification),
        ]
        for label, at_time, coro in schedule:
            if at_time is None:
                logger.info("%sの定時通知は無効です", label)
                continue
            loop = tasks.loop(time=at_time)(coro)
            loop.start()
            self._notification_loops.append(loop)
            logger.info("%sの定時通知を %02d:%02d に設定しました", label, at_time.hour, at_time.minute)
        if self.config.summary_provider == "ollama":
            logger.info(
                "夜の要約: ollama（モデル: %s / %s）",
                self.config.ollama_model,
                self.config.ollama_url,
            )
        elif self.config.summary_provider == "claude":
            logger.info("夜の要約: Claude API（モデル: %s）", self.config.anthropic_model)
        else:
            logger.info("夜の要約は無効です（SUMMARY_PROVIDER=none）")

    async def close(self) -> None:
        for loop in self._notification_loops:
            loop.cancel()
        if self._healthcheck_loop is not None:
            self._healthcheck_loop.cancel()
        if self._periodic_summary_loop is not None:
            self._periodic_summary_loop.cancel()
        if self._web_server is not None:
            self._web_server.should_exit = True
        if self._web_task is not None:
            self._web_task.cancel()
        if self._http_session is not None:
            await self._http_session.close()
        await super().close()

    async def _notification_channel(self) -> discord.abc.Messageable | None:
        channel_id = notification_channel_id(self.config)
        channel = self.get_channel(channel_id)
        if channel is None:
            logger.warning(
                "通知先チャンネル（ID: %s）が見つかりません。"
                "NOTIFICATION_CHANNEL_ID の値とBotの権限を確認してください。",
                channel_id,
            )
            return None
        return channel

    async def _send_morning_notification(self) -> None:
        await self.wait_until_ready()
        channel = await self._notification_channel()
        if channel is None:
            return
        now = datetime.now(ZoneInfo(self.config.timezone))
        try:
            # One extra tells us whether the list was capped, without
            # claiming a total we cannot know.
            issues = await asyncio.to_thread(
                self.github_service.list_open_issues, MAX_LISTED_ISSUES + 1
            )
        except Exception:
            logger.exception("朝の通知用のIssue取得に失敗しました")
            return
        has_more = len(issues) > MAX_LISTED_ISSUES
        issues = issues[:MAX_LISTED_ISSUES]
        await channel.send(build_morning_message(now, issues, has_more))
        logger.info("朝の定時通知を送信しました: 未完了タスク%s件", len(issues))

    async def _send_evening_notification(self) -> None:
        await self.wait_until_ready()
        channel = await self._notification_channel()
        if channel is None:
            return
        now = datetime.now(ZoneInfo(self.config.timezone))
        try:
            markdown = await asyncio.to_thread(self.github_service.fetch_daily_markdown, now)
        except Exception:
            logger.exception("夜の通知用の日記の取得に失敗しました")
            return

        count = count_entry_headings(markdown) if markdown else 0
        # A failed summary must not cost the user the notification itself.
        summary = await summarize_entries(
            self.summarizer, extract_entry_bodies(markdown) if markdown else []
        )
        await channel.send(build_evening_message(now, count, summary))
        logger.info(
            "夜の定時通知を送信しました: 記録%s件 要約=%s", count, "あり" if summary else "なし"
        )

    async def on_ready(self):
        logger.info("Logged in as %s (ID: %s)", self.user, self.user.id if self.user else "?")
        logger.info(
            "監視対象: サーバーID=%s / 日記チャンネルID=%s / !taskチャンネルID=%s",
            self.config.discord_guild_id,
            self.config.discord_daily_channel_id,
            task_channel_id(self.config),
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
            notify_channel = guild.get_channel(notification_channel_id(self.config))
            if notify_channel is not None:
                logger.info("通知先チャンネル: #%s", notify_channel.name)

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
            if is_task_message(self.config, incoming):
                result = await process_task_command(incoming, self.config, self.github_service)
            else:
                result = await process_message(
                    incoming,
                    self.config,
                    self.github_service,
                    self.r2_service,
                    self._download_attachment,
                    self.weather_service,
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


def create_client(
    config: Config,
    github_service: GitHubService,
    r2_service: R2Service,
    **overrides,
) -> LifelogClient:
    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    return LifelogClient(config, github_service, r2_service, intents=intents, **overrides)
