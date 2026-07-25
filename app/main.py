"""Entrypoint: wires config + services together and runs the Discord bot."""
from __future__ import annotations

import logging
import sys

from app.config import ConfigError, load_config
from app.discord_handler import create_client
from app.github_service import GitHubService
from app.r2_service import R2Service


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    try:
        config = load_config()
    except ConfigError as exc:
        print(f"設定エラー: {exc}", file=sys.stderr)
        sys.exit(1)

    github_service = GitHubService(config)
    r2_service = R2Service(config)
    client = create_client(config, github_service, r2_service)

    client.run(config.discord_bot_token)


if __name__ == "__main__":
    main()
