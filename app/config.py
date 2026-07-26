"""Environment variable loading and validation."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import time as time_of_day
from typing import Mapping

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv

REQUIRED_KEYS = [
    "DISCORD_BOT_TOKEN",
    "DISCORD_GUILD_ID",
    "DISCORD_DAILY_CHANNEL_ID",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT_URL",
]


DEFAULT_TAG_VOCABULARY = (
    "運動",
    "仕事",
    "家族",
    "食事",
    "買い物",
    "健康",
    "趣味",
    "学び",
    "移動",
    "家事",
)

MAX_TAG_LENGTH = 20


class ConfigError(Exception):
    """Raised when required configuration is missing or invalid."""


@dataclass(frozen=True)
class Config:
    discord_bot_token: str
    discord_guild_id: int
    discord_daily_channel_id: int
    discord_task_channel_id: int | None
    allowed_discord_user_ids: frozenset[int]

    github_token: str
    github_owner: str
    github_repo: str
    github_branch: str

    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str
    r2_endpoint_url: str

    timezone: str
    max_attachment_size_mb: int
    signed_url_expiry_seconds: int

    notification_channel_id: int | None
    morning_notification_time: time_of_day | None
    evening_notification_time: time_of_day | None

    log_file: str | None
    log_max_bytes: int
    log_backup_count: int

    periodic_summary_enabled: bool
    periodic_summary_time: time_of_day | None
    periodic_summary_max_input_chars: int
    report_storage_usage: bool

    tagging_enabled: bool
    tag_vocabulary: tuple[str, ...]
    tagging_timeout_seconds: int

    search_enabled: bool
    search_index_path: str
    search_backfill_days: int

    healthcheck_url: str | None
    healthcheck_interval_minutes: int

    weather_latitude: float | None
    weather_longitude: float | None

    web_enabled: bool
    web_host: str
    web_port: int
    web_password: str | None
    web_session_hours: int

    summary_provider: str
    summary_timeout_seconds: int
    ollama_url: str
    ollama_model: str
    anthropic_api_key: str | None
    anthropic_model: str

    @property
    def max_attachment_size_bytes(self) -> int:
        return self.max_attachment_size_mb * 1024 * 1024


def _parse_int(env: Mapping[str, str], key: str) -> int:
    value = env[key]
    try:
        return int(value)
    except ValueError as exc:
        raise ConfigError(f"環境変数 {key} は整数で指定してください（値: {value!r}）") from exc


def _parse_positive_int(env: Mapping[str, str], key: str, default: int) -> int:
    raw = env.get(key, "").strip() or str(default)
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"環境変数 {key} は整数で指定してください（値: {raw!r}）") from exc
    if value < 1:
        raise ConfigError(f"環境変数 {key} は1以上で指定してください（値: {value}）")
    return value


def _parse_bool(raw: str | None, default: bool) -> bool:
    raw = (raw or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _parse_optional_float(raw: str | None, key: str) -> float | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"環境変数 {key} は数値で指定してください（値: {raw!r}）") from exc


def _parse_optional_channel_id(raw: str | None, key: str) -> int | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"環境変数 {key} は整数で指定してください（値: {raw!r}）") from exc


def parse_time_of_day(raw: str | None, key: str, tzinfo) -> time_of_day | None:
    """Parse an 'HH:MM' notification time. Empty disables the notification."""
    raw = (raw or "").strip()
    if not raw:
        return None
    parts = raw.split(":")
    if len(parts) != 2:
        raise ConfigError(f"環境変数 {key} は HH:MM 形式で指定してください（値: {raw!r}）")
    try:
        hour, minute = int(parts[0]), int(parts[1])
    except ValueError as exc:
        raise ConfigError(
            f"環境変数 {key} は HH:MM 形式で指定してください（値: {raw!r}）"
        ) from exc
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ConfigError(
            f"環境変数 {key} の時刻が範囲外です（00:00〜23:59で指定してください。値: {raw!r}）"
        )
    return time_of_day(hour=hour, minute=minute, tzinfo=tzinfo)


def _parse_tag_vocabulary(raw: str | None) -> tuple[str, ...]:
    """Comma-separated tag names. Empty falls back to the built-in list.

    Tags are matched as whole words and written into the Markdown after a
    `#`, so anything containing whitespace could not round-trip.
    """
    raw = (raw or "").strip()
    if not raw:
        return DEFAULT_TAG_VOCABULARY
    tags: list[str] = []
    for part in raw.split(","):
        tag = part.strip().lstrip("#＃").strip()
        if not tag:
            continue
        if len(tag.split()) > 1:
            raise ConfigError(
                f"環境変数 TAG_VOCABULARY のタグに空白は使えません（値: {tag!r}）"
            )
        if len(tag) > MAX_TAG_LENGTH:
            raise ConfigError(
                f"環境変数 TAG_VOCABULARY のタグは{MAX_TAG_LENGTH}文字以内にしてください"
                f"（値: {tag!r}）"
            )
        if tag not in tags:
            tags.append(tag)
    if not tags:
        raise ConfigError("環境変数 TAG_VOCABULARY に有効なタグがありません")
    return tuple(tags)


def _parse_allowed_user_ids(raw: str | None) -> frozenset[int]:
    if not raw or not raw.strip():
        return frozenset()
    ids = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.add(int(part))
        except ValueError as exc:
            raise ConfigError(
                f"環境変数 ALLOWED_DISCORD_USER_IDS の値が不正です（値: {part!r}）"
            ) from exc
    return frozenset(ids)


def load_config(env: Mapping[str, str] | None = None, *, load_dotenv_file: bool = True) -> Config:
    """Load and validate configuration from environment variables.

    Raises ConfigError with a human readable message if anything required
    is missing or malformed.
    """
    if load_dotenv_file:
        load_dotenv()

    env = env if env is not None else os.environ

    missing = [key for key in REQUIRED_KEYS if not env.get(key)]
    if missing:
        raise ConfigError(
            "必須の環境変数が設定されていません: " + ", ".join(missing) +
            "。.env ファイルを確認してください。"
        )

    max_size_raw = env.get("MAX_ATTACHMENT_SIZE_MB", "20")
    try:
        max_attachment_size_mb = int(max_size_raw)
    except ValueError as exc:
        raise ConfigError(
            f"環境変数 MAX_ATTACHMENT_SIZE_MB は整数で指定してください（値: {max_size_raw!r}）"
        ) from exc

    discord_task_channel_id = _parse_optional_channel_id(
        env.get("DISCORD_TASK_CHANNEL_ID"), "DISCORD_TASK_CHANNEL_ID"
    )

    expiry_raw = env.get("SIGNED_URL_EXPIRY_SECONDS", "300")
    try:
        signed_url_expiry_seconds = int(expiry_raw)
    except ValueError as exc:
        raise ConfigError(
            f"環境変数 SIGNED_URL_EXPIRY_SECONDS は整数で指定してください（値: {expiry_raw!r}）"
        ) from exc
    # S3署名付きURLの上限は7日間
    if not 1 <= signed_url_expiry_seconds <= 604800:
        raise ConfigError(
            "環境変数 SIGNED_URL_EXPIRY_SECONDS は1〜604800（7日）の範囲で指定してください"
            f"（値: {signed_url_expiry_seconds}）"
        )

    timezone = env.get("TIMEZONE") or "Asia/Tokyo"
    try:
        tzinfo = ZoneInfo(timezone)
    except ZoneInfoNotFoundError as exc:
        raise ConfigError(
            f"タイムゾーン {timezone!r} が見つかりません。"
            "Windowsの場合は 'pip install tzdata' を実行してください"
            "（requirements.txt に含まれています）。"
        ) from exc

    morning_notification_time = parse_time_of_day(
        env.get("MORNING_NOTIFICATION_TIME", "04:00"), "MORNING_NOTIFICATION_TIME", tzinfo
    )
    evening_notification_time = parse_time_of_day(
        env.get("EVENING_NOTIFICATION_TIME", "20:00"), "EVENING_NOTIFICATION_TIME", tzinfo
    )

    periodic_summary_enabled = _parse_bool(env.get("PERIODIC_SUMMARY_ENABLED"), False)
    periodic_summary_time = parse_time_of_day(
        env.get("PERIODIC_SUMMARY_TIME", "05:00"), "PERIODIC_SUMMARY_TIME", tzinfo
    )
    if periodic_summary_enabled and periodic_summary_time is None:
        raise ConfigError(
            "PERIODIC_SUMMARY_ENABLED=true のときは PERIODIC_SUMMARY_TIME を"
            "HH:MM 形式で指定してください"
        )

    weather_latitude = _parse_optional_float(env.get("WEATHER_LATITUDE"), "WEATHER_LATITUDE")
    weather_longitude = _parse_optional_float(
        env.get("WEATHER_LONGITUDE"), "WEATHER_LONGITUDE"
    )
    if (weather_latitude is None) != (weather_longitude is None):
        raise ConfigError(
            "WEATHER_LATITUDE と WEATHER_LONGITUDE は両方とも設定するか、"
            "両方とも空にしてください"
        )

    web_enabled = _parse_bool(env.get("WEB_ENABLED"), False)
    web_password = env.get("WEB_PASSWORD", "").strip() or None
    if web_enabled and not web_password:
        raise ConfigError(
            "WEB_ENABLED=true のときは WEB_PASSWORD の設定が必要です"
            "（日記が誰でも閲覧できる状態になるため）"
        )
    if web_password is not None and len(web_password) < 8:
        raise ConfigError("WEB_PASSWORD は8文字以上にしてください")

    summary_provider = (env.get("SUMMARY_PROVIDER", "").strip() or "none").lower()
    if summary_provider not in ("none", "ollama", "claude"):
        raise ConfigError(
            "環境変数 SUMMARY_PROVIDER は none / ollama / claude のいずれかで指定してください"
            f"（値: {summary_provider!r}）"
        )
    anthropic_api_key = env.get("ANTHROPIC_API_KEY", "").strip() or None
    if summary_provider == "claude" and not anthropic_api_key:
        raise ConfigError(
            "SUMMARY_PROVIDER=claude を使うには ANTHROPIC_API_KEY の設定が必要です"
        )

    tagging_enabled = _parse_bool(env.get("TAGGING_ENABLED"), False)
    if tagging_enabled and summary_provider == "none":
        raise ConfigError(
            "TAGGING_ENABLED=true を使うには SUMMARY_PROVIDER の設定が必要です"
            "（タグはAIが付けるため、none のままでは何も付きません）"
        )

    return Config(
        discord_bot_token=env["DISCORD_BOT_TOKEN"],
        discord_guild_id=_parse_int(env, "DISCORD_GUILD_ID"),
        discord_daily_channel_id=_parse_int(env, "DISCORD_DAILY_CHANNEL_ID"),
        discord_task_channel_id=discord_task_channel_id,
        allowed_discord_user_ids=_parse_allowed_user_ids(env.get("ALLOWED_DISCORD_USER_IDS")),
        github_token=env["GITHUB_TOKEN"],
        github_owner=env["GITHUB_OWNER"],
        github_repo=env["GITHUB_REPO"],
        github_branch=env.get("GITHUB_BRANCH") or "main",
        r2_account_id=env["R2_ACCOUNT_ID"],
        r2_access_key_id=env["R2_ACCESS_KEY_ID"],
        r2_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        r2_bucket_name=env["R2_BUCKET_NAME"],
        r2_endpoint_url=env["R2_ENDPOINT_URL"],
        timezone=timezone,
        max_attachment_size_mb=max_attachment_size_mb,
        signed_url_expiry_seconds=signed_url_expiry_seconds,
        notification_channel_id=_parse_optional_channel_id(
            env.get("NOTIFICATION_CHANNEL_ID"), "NOTIFICATION_CHANNEL_ID"
        ),
        morning_notification_time=morning_notification_time,
        evening_notification_time=evening_notification_time,
        log_file=(env.get("LOG_FILE", "").strip() or None),
        log_max_bytes=_parse_positive_int(env, "LOG_MAX_BYTES", 5 * 1024 * 1024),
        log_backup_count=_parse_positive_int(env, "LOG_BACKUP_COUNT", 3),
        periodic_summary_enabled=periodic_summary_enabled,
        periodic_summary_time=periodic_summary_time,
        periodic_summary_max_input_chars=_parse_positive_int(
            env, "PERIODIC_SUMMARY_MAX_INPUT_CHARS", 12000
        ),
        report_storage_usage=_parse_bool(env.get("REPORT_STORAGE_USAGE"), True),
        tagging_enabled=tagging_enabled,
        tag_vocabulary=_parse_tag_vocabulary(env.get("TAG_VOCABULARY")),
        # Generous by default: a local Ollama loads the model into RAM on
        # the first call after a pause, which on its own can take a minute.
        tagging_timeout_seconds=_parse_positive_int(env, "TAGGING_TIMEOUT_SECONDS", 120),
        search_enabled=_parse_bool(env.get("SEARCH_ENABLED"), False),
        search_index_path=env.get("SEARCH_INDEX_PATH", "").strip() or "data/search.db",
        search_backfill_days=_parse_positive_int(env, "SEARCH_BACKFILL_DAYS", 730),
        healthcheck_url=env.get("HEALTHCHECK_URL", "").strip() or None,
        healthcheck_interval_minutes=_parse_positive_int(
            env, "HEALTHCHECK_INTERVAL_MINUTES", 60
        ),
        weather_latitude=weather_latitude,
        weather_longitude=weather_longitude,
        web_enabled=web_enabled,
        web_host=env.get("WEB_HOST", "").strip() or "0.0.0.0",
        web_port=_parse_positive_int(env, "WEB_PORT", 8787),
        web_password=web_password,
        web_session_hours=_parse_positive_int(env, "WEB_SESSION_HOURS", 720),
        summary_provider=summary_provider,
        summary_timeout_seconds=_parse_positive_int(env, "SUMMARY_TIMEOUT_SECONDS", 180),
        ollama_url=env.get("OLLAMA_URL", "").strip() or "http://localhost:11434",
        ollama_model=env.get("OLLAMA_MODEL", "").strip() or "qwen2.5:7b",
        anthropic_api_key=anthropic_api_key,
        anthropic_model=env.get("ANTHROPIC_MODEL", "").strip() or "claude-opus-5",
    )


def is_user_allowed(config: Config, user_id: int) -> bool:
    """If no allow-list is configured, everyone is allowed."""
    if not config.allowed_discord_user_ids:
        return True
    return user_id in config.allowed_discord_user_ids
