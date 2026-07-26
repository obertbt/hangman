import logging
from logging.handlers import RotatingFileHandler

from app.main import build_log_handlers
from tests.test_config import _make_config


def test_build_log_handlers_console_only_by_default():
    handlers = build_log_handlers(_make_config(log_file=None))
    assert len(handlers) == 1
    assert isinstance(handlers[0], logging.StreamHandler)


def test_build_log_handlers_adds_rotating_file(tmp_path):
    log_path = tmp_path / "bot.log"
    config = _make_config(log_file=str(log_path), log_max_bytes=1024, log_backup_count=2)

    handlers = build_log_handlers(config)

    file_handlers = [h for h in handlers if isinstance(h, RotatingFileHandler)]
    assert len(file_handlers) == 1
    handler = file_handlers[0]
    assert handler.maxBytes == 1024
    assert handler.backupCount == 2
    # Japanese text and emoji in log messages break under the default
    # Windows encoding, so UTF-8 must be explicit.
    assert handler.encoding == "utf-8"
    handler.close()


def test_build_log_handlers_creates_missing_directory(tmp_path):
    log_path = tmp_path / "nested" / "dir" / "bot.log"
    handlers = build_log_handlers(_make_config(log_file=str(log_path)))

    assert log_path.parent.is_dir()
    for handler in handlers:
        handler.close()


def test_rotating_handler_writes_japanese_and_emoji(tmp_path):
    log_path = tmp_path / "bot.log"
    handlers = build_log_handlers(_make_config(log_file=str(log_path)))
    handler = next(h for h in handlers if isinstance(h, RotatingFileHandler))

    record = logging.LogRecord(
        "test", logging.INFO, __file__, 1, "✅ ライフログを保存しました", None, None
    )
    handler.emit(record)
    handler.close()

    assert "✅ ライフログを保存しました" in log_path.read_text(encoding="utf-8")
