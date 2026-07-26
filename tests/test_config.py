import pytest

from app.config import Config, ConfigError, is_user_allowed, load_config

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
