import pytest

from app.config import (
    DEFAULT_TAG_VOCABULARY,
    Config,
    ConfigError,
    is_user_allowed,
    load_config,
)

BASE_ENV = {
    "DISCORD_BOT_TOKEN": "token",
    "DISCORD_GUILD_ID": "111",
    "DISCORD_DAILY_CHANNEL_ID": "222",
    "GITHUB_TOKEN": "ghp_xxx",
    "GITHUB_OWNER": "owner",
    "GITHUB_REPO": "hearth-life",
    "R2_ACCOUNT_ID": "account",
    "R2_ACCESS_KEY_ID": "key",
    "R2_SECRET_ACCESS_KEY": "secret",
    "R2_BUCKET_NAME": "hearth-media",
    "R2_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
}


def test_load_config_success_with_defaults():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.discord_guild_id == 111
    assert config.discord_daily_channel_id == 222
    assert config.github_branch == "main"
    assert config.timezone == "Asia/Tokyo"
    assert config.max_attachment_size_mb == 20
    assert config.allowed_discord_user_ids == frozenset()


def test_load_config_missing_required_raises():
    env = dict(BASE_ENV)
    del env["GITHUB_TOKEN"]
    with pytest.raises(ConfigError, match="GITHUB_TOKEN"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_invalid_int_raises():
    env = dict(BASE_ENV, DISCORD_GUILD_ID="not-a-number")
    with pytest.raises(ConfigError):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_task_channel_defaults_to_none():
    assert load_config(env=BASE_ENV, load_dotenv_file=False).discord_task_channel_id is None


def test_load_config_parses_task_channel_id():
    env = dict(BASE_ENV, DISCORD_TASK_CHANNEL_ID="444")
    assert load_config(env=env, load_dotenv_file=False).discord_task_channel_id == 444


def test_load_config_rejects_invalid_task_channel_id():
    env = dict(BASE_ENV, DISCORD_TASK_CHANNEL_ID="abc")
    with pytest.raises(ConfigError, match="DISCORD_TASK_CHANNEL_ID"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_signed_url_expiry_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.signed_url_expiry_seconds == 300


def test_load_config_signed_url_expiry_custom():
    env = dict(BASE_ENV, SIGNED_URL_EXPIRY_SECONDS="600")
    assert load_config(env=env, load_dotenv_file=False).signed_url_expiry_seconds == 600


@pytest.mark.parametrize("value", ["0", "-1", "604801", "abc"])
def test_load_config_rejects_invalid_signed_url_expiry(value):
    env = dict(BASE_ENV, SIGNED_URL_EXPIRY_SECONDS=value)
    with pytest.raises(ConfigError, match="SIGNED_URL_EXPIRY_SECONDS"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_notification_times_default_to_4am_and_8pm():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert (config.morning_notification_time.hour, config.morning_notification_time.minute) == (4, 0)
    assert (config.evening_notification_time.hour, config.evening_notification_time.minute) == (20, 0)
    assert config.morning_notification_time.tzinfo is not None


def test_load_config_parses_custom_notification_times():
    env = dict(BASE_ENV, MORNING_NOTIFICATION_TIME="07:30", EVENING_NOTIFICATION_TIME="23:05")
    config = load_config(env=env, load_dotenv_file=False)
    assert (config.morning_notification_time.hour, config.morning_notification_time.minute) == (7, 30)
    assert (config.evening_notification_time.hour, config.evening_notification_time.minute) == (23, 5)


def test_load_config_empty_notification_time_disables_it():
    env = dict(BASE_ENV, MORNING_NOTIFICATION_TIME="", EVENING_NOTIFICATION_TIME="")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.morning_notification_time is None
    assert config.evening_notification_time is None


@pytest.mark.parametrize("value", ["7", "07:60", "24:00", "abc", "07:30:00", "-1:00"])
def test_load_config_rejects_invalid_notification_time(value):
    env = dict(BASE_ENV, MORNING_NOTIFICATION_TIME=value)
    with pytest.raises(ConfigError, match="MORNING_NOTIFICATION_TIME"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_parses_notification_channel_id():
    env = dict(BASE_ENV, NOTIFICATION_CHANNEL_ID="555")
    assert load_config(env=env, load_dotenv_file=False).notification_channel_id == 555


def test_load_config_notification_channel_defaults_to_none():
    assert load_config(env=BASE_ENV, load_dotenv_file=False).notification_channel_id is None


def test_load_config_log_file_defaults_to_none():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.log_file is None
    assert config.log_max_bytes == 5 * 1024 * 1024
    assert config.log_backup_count == 3


def test_load_config_parses_log_settings():
    env = dict(BASE_ENV, LOG_FILE="logs/bot.log", LOG_MAX_BYTES="1024", LOG_BACKUP_COUNT="5")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.log_file == "logs/bot.log"
    assert config.log_max_bytes == 1024
    assert config.log_backup_count == 5


@pytest.mark.parametrize("key", ["LOG_MAX_BYTES", "LOG_BACKUP_COUNT"])
@pytest.mark.parametrize("value", ["0", "-1", "abc"])
def test_load_config_rejects_invalid_log_numbers(key, value):
    env = dict(BASE_ENV, **{key: value})
    with pytest.raises(ConfigError, match=key):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_web_disabled_by_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.web_enabled is False
    assert config.web_port == 8787
    assert config.web_password is None


def test_load_config_enables_web_with_password():
    env = dict(BASE_ENV, WEB_ENABLED="true", WEB_PASSWORD="hunter2hunter2", WEB_PORT="9000")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.web_enabled is True
    assert config.web_port == 9000


def test_load_config_requires_password_when_web_enabled():
    env = dict(BASE_ENV, WEB_ENABLED="true")
    with pytest.raises(ConfigError, match="WEB_PASSWORD"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_rejects_short_web_password():
    env = dict(BASE_ENV, WEB_ENABLED="true", WEB_PASSWORD="short")
    with pytest.raises(ConfigError, match="8文字以上"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_summary_disabled_by_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.summary_provider == "none"
    assert config.ollama_url == "http://localhost:11434"
    assert config.summary_timeout_seconds == 180


def test_load_config_parses_ollama_summary_settings():
    env = dict(
        BASE_ENV,
        SUMMARY_PROVIDER="ollama",
        OLLAMA_MODEL="qwen2.5:7b",
        SUMMARY_TIMEOUT_SECONDS="60",
    )
    config = load_config(env=env, load_dotenv_file=False)
    assert config.summary_provider == "ollama"
    assert config.ollama_model == "qwen2.5:7b"
    assert config.summary_timeout_seconds == 60


def test_load_config_rejects_unknown_summary_provider():
    env = dict(BASE_ENV, SUMMARY_PROVIDER="gpt")
    with pytest.raises(ConfigError, match="SUMMARY_PROVIDER"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_requires_api_key_for_claude_provider():
    env = dict(BASE_ENV, SUMMARY_PROVIDER="claude")
    with pytest.raises(ConfigError, match="ANTHROPIC_API_KEY"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_accepts_claude_provider_with_api_key():
    env = dict(BASE_ENV, SUMMARY_PROVIDER="claude", ANTHROPIC_API_KEY="sk-test")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.summary_provider == "claude"
    assert config.anthropic_model == "claude-opus-5"


def test_load_config_rejects_unknown_timezone():
    env = dict(BASE_ENV, TIMEZONE="Not/AZone")
    with pytest.raises(ConfigError, match="tzdata"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_parses_allowed_user_ids():
    env = dict(BASE_ENV, ALLOWED_DISCORD_USER_IDS="1, 2,3")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.allowed_discord_user_ids == frozenset({1, 2, 3})


def _make_config(**overrides) -> Config:
    defaults = dict(
        discord_bot_token="t",
        discord_guild_id=1,
        discord_daily_channel_id=2,
        discord_task_channel_id=None,
        allowed_discord_user_ids=frozenset(),
        github_token="t",
        github_owner="o",
        github_repo="r",
        github_branch="main",
        r2_account_id="a",
        r2_access_key_id="k",
        r2_secret_access_key="s",
        r2_bucket_name="b",
        r2_endpoint_url="https://example.com",
        timezone="Asia/Tokyo",
        max_attachment_size_mb=20,
        signed_url_expiry_seconds=300,
        notification_channel_id=None,
        morning_notification_time=None,
        evening_notification_time=None,
        log_file=None,
        log_max_bytes=5 * 1024 * 1024,
        log_backup_count=3,
        periodic_summary_enabled=False,
        periodic_summary_time=None,
        periodic_summary_max_input_chars=12000,
        report_storage_usage=True,
        tagging_enabled=False,
        tag_vocabulary=DEFAULT_TAG_VOCABULARY,
        tagging_timeout_seconds=30,
        search_enabled=False,
        search_index_path="data/search.db",
        search_backfill_days=730,
        healthcheck_url=None,
        healthcheck_interval_minutes=60,
        weather_latitude=None,
        weather_longitude=None,
        web_enabled=False,
        web_host="127.0.0.1",
        web_port=8787,
        web_password=None,
        web_session_hours=720,
        summary_provider="none",
        summary_timeout_seconds=180,
        ollama_url="http://localhost:11434",
        ollama_model="qwen2.5:7b",
        anthropic_api_key=None,
        anthropic_model="claude-opus-5",
    )
    defaults.update(overrides)
    return Config(**defaults)


def test_is_user_allowed_returns_true_when_no_allowlist():
    config = _make_config(allowed_discord_user_ids=frozenset())
    assert is_user_allowed(config, 999) is True


def test_is_user_allowed_restricts_to_list():
    config = _make_config(allowed_discord_user_ids=frozenset({10, 20}))
    assert is_user_allowed(config, 10) is True
    assert is_user_allowed(config, 30) is False


def test_load_config_healthcheck_disabled_by_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.healthcheck_url is None
    assert config.healthcheck_interval_minutes == 60


def test_load_config_parses_healthcheck_settings():
    env = dict(
        BASE_ENV,
        HEALTHCHECK_URL="https://hc-ping.com/uuid",
        HEALTHCHECK_INTERVAL_MINUTES="15",
    )
    config = load_config(env=env, load_dotenv_file=False)
    assert config.healthcheck_url == "https://hc-ping.com/uuid"
    assert config.healthcheck_interval_minutes == 15


def test_load_config_weather_disabled_by_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.weather_latitude is None
    assert config.weather_longitude is None


def test_load_config_parses_weather_coordinates():
    env = dict(BASE_ENV, WEATHER_LATITUDE="35.68", WEATHER_LONGITUDE="139.76")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.weather_latitude == pytest.approx(35.68)
    assert config.weather_longitude == pytest.approx(139.76)


@pytest.mark.parametrize(
    "env_extra",
    [{"WEATHER_LATITUDE": "35.68"}, {"WEATHER_LONGITUDE": "139.76"}],
)
def test_load_config_rejects_half_configured_coordinates(env_extra):
    env = dict(BASE_ENV, **env_extra)
    with pytest.raises(ConfigError, match="WEATHER_"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_rejects_non_numeric_latitude():
    env = dict(BASE_ENV, WEATHER_LATITUDE="north", WEATHER_LONGITUDE="139.76")
    with pytest.raises(ConfigError, match="WEATHER_LATITUDE"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_periodic_summary_disabled_by_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.periodic_summary_enabled is False
    assert config.periodic_summary_max_input_chars == 12000
    assert config.report_storage_usage is True


def test_load_config_enables_periodic_summary():
    env = dict(BASE_ENV, PERIODIC_SUMMARY_ENABLED="true", PERIODIC_SUMMARY_TIME="06:30")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.periodic_summary_enabled is True
    assert (config.periodic_summary_time.hour, config.periodic_summary_time.minute) == (6, 30)


def test_load_config_rejects_enabled_summary_without_time():
    env = dict(BASE_ENV, PERIODIC_SUMMARY_ENABLED="true", PERIODIC_SUMMARY_TIME="")
    with pytest.raises(ConfigError, match="PERIODIC_SUMMARY_TIME"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_storage_usage_can_be_disabled():
    env = dict(BASE_ENV, REPORT_STORAGE_USAGE="false")
    assert load_config(env=env, load_dotenv_file=False).report_storage_usage is False


def test_load_config_tagging_disabled_by_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.tagging_enabled is False
    assert config.tag_vocabulary == DEFAULT_TAG_VOCABULARY
    assert config.tagging_timeout_seconds == 120


def test_load_config_enables_tagging_with_a_provider():
    env = dict(BASE_ENV, TAGGING_ENABLED="true", SUMMARY_PROVIDER="ollama")
    assert load_config(env=env, load_dotenv_file=False).tagging_enabled is True


def test_load_config_rejects_tagging_without_a_provider():
    """Tags come from the LLM; none means they could never be produced."""
    env = dict(BASE_ENV, TAGGING_ENABLED="true")
    with pytest.raises(ConfigError, match="SUMMARY_PROVIDER"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_parses_a_custom_vocabulary():
    env = dict(BASE_ENV, TAG_VOCABULARY="運動, #ホッケー ,運動")
    assert load_config(env=env, load_dotenv_file=False).tag_vocabulary == ("運動", "ホッケー")


def test_load_config_rejects_a_tag_containing_a_space():
    env = dict(BASE_ENV, TAG_VOCABULARY="朝 ラン")
    with pytest.raises(ConfigError, match="TAG_VOCABULARY"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_rejects_an_all_blank_vocabulary():
    env = dict(BASE_ENV, TAG_VOCABULARY=", ,")
    with pytest.raises(ConfigError, match="TAG_VOCABULARY"):
        load_config(env=env, load_dotenv_file=False)


def test_load_config_search_disabled_by_default():
    config = load_config(env=BASE_ENV, load_dotenv_file=False)
    assert config.search_enabled is False
    assert config.search_index_path == "data/search.db"
    assert config.search_backfill_days == 730


def test_load_config_enables_search():
    env = dict(BASE_ENV, SEARCH_ENABLED="true", SEARCH_INDEX_PATH="C:/bot/search.db")
    config = load_config(env=env, load_dotenv_file=False)
    assert config.search_enabled is True
    assert config.search_index_path == "C:/bot/search.db"
