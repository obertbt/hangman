"""Entrypoint: wires config + services together and runs the Discord bot."""
from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import Config, ConfigError, load_config
from app.discord_handler import create_client
from app.github_service import GitHubService
from app.r2_service import R2Service

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def build_log_handlers(config: Config) -> list[logging.Handler]:
    """Console output, plus a rotating file when LOG_FILE is set.

    Unattended runs (Windows Task Scheduler, launchd) have no console to
    read, so the file is the only record of what happened. UTF-8 is
    explicit because the default encoding on Japanese Windows cannot
    represent the emoji and characters these logs contain.
    """
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if config.log_file:
        path = Path(config.log_file)
        if path.parent != Path(""):
            path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(
            RotatingFileHandler(
                path,
                maxBytes=config.log_max_bytes,
                backupCount=config.log_backup_count,
                encoding="utf-8",
            )
        )
    return handlers


def main() -> None:
    # Logging is configured only after the config loads, so start with a
    # console-only basis for any early failure.
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)

    try:
        config = load_config()
    except ConfigError as exc:
        print(f"設定エラー: {exc}", file=sys.stderr)
        sys.exit(1)

    logging.basicConfig(
        level=logging.INFO,
        format=LOG_FORMAT,
        handlers=build_log_handlers(config),
        force=True,
    )
    if config.log_file:
        logging.getLogger(__name__).info("ログファイル: %s", config.log_file)

    github_service = GitHubService(config)
    r2_service = R2Service(config)
    client = create_client(config, github_service, r2_service)

    client.run(config.discord_bot_token)


if __name__ == "__main__":
    main()
