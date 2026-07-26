"""Entrypoint: wires config + services together and runs the Discord bot."""
from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import Config, ConfigError, load_config
from app.discord_handler import create_client
from app.github_service import GitHubService
from app.r2_service import R2Service
from app.single_instance import AlreadyRunningError, acquire_lock

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
    logger = logging.getLogger(__name__)

    # Held for the life of the process; a second bot exits here instead
    # of quietly saving every post twice.
    try:
        lock = acquire_lock()
    except AlreadyRunningError as exc:
        logger.error("%s", exc)
        sys.exit(1)

    # The PID makes it obvious whether two bots are genuinely running:
    # on Windows the venv launcher shows a second python.exe that is only
    # a child of the real interpreter, not a second instance.
    logger.info("起動しました (PID: %s)", os.getpid())
    if config.log_file:
        logger.info("ログファイル: %s", config.log_file)

    github_service = GitHubService(config)
    r2_service = R2Service(config)
    client = create_client(config, github_service, r2_service)

    try:
        client.run(config.discord_bot_token)
    finally:
        lock.close()


if __name__ == "__main__":
    main()
