"""Environment variable loading and validation."""
from __future__ import annotations

import os
from dataclasses import dataclass
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

    @property
    def max_attachment_size_bytes(self) -> int:
        return self.max_attachment_size_mb * 1024 * 1024


def _parse_int(env: Mapping[str, str], key: str) -> int:
    value = env[key]
    try:
        return int(value)
    except ValueError as exc:
        raise ConfigError(f"環境変数 {key} は整数で指定してください（値: {value!r}）") from exc


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

    task_channel_raw = env.get("DISCORD_TASK_CHANNEL_ID", "").strip()
    if task_channel_raw:
        try:
            discord_task_channel_id: int | None = int(task_channel_raw)
        except ValueError as exc:
            raise ConfigError(
                "環境変数 DISCORD_TASK_CHANNEL_ID は整数で指定してください"
                f"（値: {task_channel_raw!r}）"
            ) from exc
    else:
        discord_task_channel_id = None

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
        ZoneInfo(timezone)
    except ZoneInfoNotFoundError as exc:
        raise ConfigError(
            f"タイムゾーン {timezone!r} が見つかりません。"
            "Windowsの場合は 'pip install tzdata' を実行してください"
            "（requirements.txt に含まれています）。"
        ) from exc

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
    )


def is_user_allowed(config: Config, user_id: int) -> bool:
    """If no allow-list is configured, everyone is allowed."""
    if not config.allowed_discord_user_ids:
        return True
    return user_id in config.allowed_discord_user_ids
