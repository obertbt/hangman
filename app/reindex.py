"""Rebuilds the search index from GitHub: `python -m app.reindex`.

The bot backfills an empty index by itself, so this is for the cases it
cannot notice: entries edited directly on GitHub, a changed tag
vocabulary, or an index file that was deleted and needs recreating.
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import ConfigError, load_config
from app.github_service import GitHubService
from app.main import LOG_FORMAT, build_log_handlers
from app.search_index import SearchIndex

logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)

    try:
        config = load_config()
    except ConfigError as exc:
        print(f"設定エラー: {exc}", file=sys.stderr)
        sys.exit(1)

    logging.basicConfig(
        level=logging.INFO, format=LOG_FORMAT, handlers=build_log_handlers(config), force=True
    )

    if not config.search_enabled:
        print(
            "SEARCH_ENABLED=false のため何もしませんでした。"
            ".env で SEARCH_ENABLED=true にしてから実行してください。",
            file=sys.stderr,
        )
        sys.exit(1)

    today = datetime.now(ZoneInfo(config.timezone)).date()
    start = today - timedelta(days=config.search_backfill_days)

    github_service = GitHubService(config)
    index = SearchIndex(config.search_index_path)
    try:
        logger.info("GitHubから日記を取得しています（%s 〜 %s）", start, today)
        days = github_service.fetch_entries_in_range(start, today)
        total = index.rebuild(days)
    finally:
        index.close()

    logger.info("検索インデックスを作り直しました: %s日分 / %s件", len(days), total)
    print(f"完了しました: {len(days)}日分 / {total}件を登録しました（{config.search_index_path}）")


if __name__ == "__main__":
    main()
