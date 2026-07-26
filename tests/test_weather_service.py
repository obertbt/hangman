import pytest

from app.weather_service import WeatherService, describe_weather_code, format_weather
from tests.test_config import _make_config

TOKYO = dict(weather_latitude=35.68, weather_longitude=139.76)


def test_describe_known_codes():
    assert describe_weather_code(0) == "快晴"
    assert describe_weather_code(3) == "曇り"
    assert describe_weather_code(95) == "雷雨"


def test_describe_unknown_code_is_labelled_not_crashing():
    assert "123" in describe_weather_code(123)


def test_format_weather_includes_one_decimal_temperature():
    assert format_weather(1, 24.53) == "晴れ 24.5℃"


def test_format_weather_without_temperature():
    assert format_weather(1, None) == "晴れ"


def test_format_weather_handles_negative_temperature():
    assert format_weather(71, -3.2) == "小雪 -3.2℃"


def test_service_disabled_without_coordinates():
    assert WeatherService(_make_config()).enabled is False


def test_service_enabled_with_coordinates():
    assert WeatherService(_make_config(**TOKYO)).enabled is True


@pytest.mark.asyncio
async def test_disabled_service_returns_none_without_calling_api():
    assert await WeatherService(_make_config()).current_weather() is None


@pytest.mark.asyncio
async def test_network_failure_returns_none(monkeypatch):
    """The weather is an annotation — an outage must not raise."""
    service = WeatherService(_make_config(**TOKYO))

    def boom(*args, **kwargs):
        raise RuntimeError("network down")

    monkeypatch.setattr("app.weather_service.aiohttp.ClientSession", boom)
    assert await service.current_weather() is None
