"""Looks up the current weather to record alongside a diary entry.

Uses Open-Meteo, which needs no API key and no account. Every failure
returns None: the weather is a nice-to-have annotation and must never
stop an entry from being saved.
"""
from __future__ import annotations

import logging

import aiohttp

logger = logging.getLogger(__name__)

API_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather interpretation codes, grouped to the granularity a diary needs.
_WMO_DESCRIPTIONS: dict[int, str] = {
    0: "快晴",
    1: "晴れ",
    2: "一部曇り",
    3: "曇り",
    45: "霧",
    48: "霧（霧氷）",
    51: "霧雨",
    53: "霧雨",
    55: "霧雨",
    56: "着氷性の霧雨",
    57: "着氷性の霧雨",
    61: "小雨",
    63: "雨",
    65: "大雨",
    66: "着氷性の雨",
    67: "着氷性の雨",
    71: "小雪",
    73: "雪",
    75: "大雪",
    77: "細氷",
    80: "にわか雨",
    81: "にわか雨",
    82: "激しいにわか雨",
    85: "にわか雪",
    86: "激しいにわか雪",
    95: "雷雨",
    96: "雹を伴う雷雨",
    99: "雹を伴う雷雨",
}


def describe_weather_code(code: int) -> str:
    return _WMO_DESCRIPTIONS.get(code, f"不明な天気（コード{code}）")


def format_weather(code: int, temperature: float | None) -> str:
    description = describe_weather_code(code)
    if temperature is None:
        return description
    return f"{description} {temperature:.1f}℃"


class WeatherService:
    def __init__(self, config):
        self._latitude = config.weather_latitude
        self._longitude = config.weather_longitude
        self._timezone = config.timezone
        self._enabled = self._latitude is not None and self._longitude is not None

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def current_weather(self) -> str | None:
        """`晴れ 24.5℃` style text, or None when disabled or unavailable."""
        if not self._enabled:
            return None
        params = {
            "latitude": self._latitude,
            "longitude": self._longitude,
            "current": "temperature_2m,weather_code",
            "timezone": self._timezone,
        }
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(API_URL, params=params) as response:
                    response.raise_for_status()
                    data = await response.json()
            current = data["current"]
            return format_weather(
                int(current["weather_code"]), current.get("temperature_2m")
            )
        except Exception:
            logger.warning("天気の取得に失敗しました", exc_info=True)
            return None
