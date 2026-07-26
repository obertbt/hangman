"""A small read-only web viewer for the diary and tasks.

Everything is rendered server-side from GitHub and R2 on request — the
viewer stores no copy of the diary, so it can never drift from what the
bot saved. Images stay in the private bucket; each page render mints a
short-lived signed URL for the images it shows.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from app.config import Config
from app.diary import parse_daily_markdown
from app.github_service import GitHubService
from app.r2_service import R2Service, validate_object_key
from app.web_auth import SESSION_COOKIE, SessionStore

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"
MAX_LISTED_TASKS = 50


@dataclass
class DayEntry:
    """One entry as the page shows it: signed image URLs, no R2 keys."""

    time_str: str
    body: str
    image_urls: list[str]


def month_label(year: int, month: int) -> str:
    return f"{year}年{month}月"


def shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = (year * 12 + (month - 1)) + delta
    return divmod(index, 12)[0], divmod(index, 12)[1] + 1


def create_app(
    config: Config,
    github_service: GitHubService,
    r2_service: R2Service,
    *,
    session_store: SessionStore | None = None,
) -> FastAPI:
    app = FastAPI(title="hearth-life", docs_url=None, redoc_url=None, openapi_url=None)
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    sessions = session_store or SessionStore(
        session_seconds=config.web_session_hours * 3600
    )
    tz = ZoneInfo(config.timezone)

    def authed(request: Request) -> bool:
        return sessions.is_valid(request.cookies.get(SESSION_COOKIE))

    def login_redirect() -> RedirectResponse:
        return RedirectResponse("/login", status_code=303)

    @app.get("/login", response_class=HTMLResponse)
    async def login_form(request: Request):
        if authed(request):
            return RedirectResponse("/", status_code=303)
        return templates.TemplateResponse(request, "login.html", {"error": None})

    @app.post("/login", response_class=HTMLResponse)
    async def login(request: Request, password: str = Form("")):
        if sessions.is_locked_out():
            return templates.TemplateResponse(
                request,
                "login.html",
                {"error": "試行回数が多すぎます。5分ほど待ってからやり直してください。"},
                status_code=429,
            )
        if not sessions.verify_password(config.web_password or "", password):
            sessions.record_failure()
            logger.warning("Webログインに失敗しました")
            return templates.TemplateResponse(
                request, "login.html", {"error": "パスワードが違います。"}, status_code=401
            )
        response = RedirectResponse("/", status_code=303)
        response.set_cookie(
            SESSION_COOKIE,
            sessions.create(),
            httponly=True,
            samesite="lax",
            max_age=config.web_session_hours * 3600,
        )
        return response

    @app.post("/logout")
    async def logout(request: Request):
        sessions.destroy(request.cookies.get(SESSION_COOKIE))
        response = RedirectResponse("/login", status_code=303)
        response.delete_cookie(SESSION_COOKIE)
        return response

    @app.get("/", response_class=HTMLResponse)
    async def home(request: Request):
        if not authed(request):
            return login_redirect()
        today = datetime.now(tz).date()
        return RedirectResponse(f"/month/{today:%Y-%m}", status_code=303)

    @app.get("/month/{month_str}", response_class=HTMLResponse)
    async def month_view(request: Request, month_str: str):
        if not authed(request):
            return login_redirect()
        try:
            parsed = datetime.strptime(month_str, "%Y-%m")
        except ValueError:
            return Response("月の指定が正しくありません（YYYY-MM）", status_code=400)

        year, month = parsed.year, parsed.month
        try:
            dates = await asyncio.to_thread(
                github_service.list_dates_in_month, year, month
            )
        except Exception:
            logger.exception("日記一覧の取得に失敗しました: %s", month_str)
            return Response("日記一覧の取得に失敗しました", status_code=502)

        prev_year, prev_month = shift_month(year, month, -1)
        next_year, next_month = shift_month(year, month, 1)
        return templates.TemplateResponse(
            request,
            "month.html",
            {
                "title": month_label(year, month),
                "dates": dates,
                "prev_month": f"{prev_year:04d}-{prev_month:02d}",
                "next_month": f"{next_year:04d}-{next_month:02d}",
                "today": f"{datetime.now(tz).date():%Y-%m-%d}",
            },
        )

    @app.get("/day/{day_str}", response_class=HTMLResponse)
    async def day_view(request: Request, day_str: str):
        if not authed(request):
            return login_redirect()
        try:
            day = datetime.strptime(day_str, "%Y-%m-%d").replace(tzinfo=tz)
        except ValueError:
            return Response("日付の指定が正しくありません（YYYY-MM-DD）", status_code=400)

        try:
            markdown = await asyncio.to_thread(github_service.fetch_daily_markdown, day)
        except Exception:
            logger.exception("日記の取得に失敗しました: %s", day_str)
            return Response("日記の取得に失敗しました", status_code=502)

        entries = [
            DayEntry(
                time_str=entry.time_str,
                body=entry.body,
                image_urls=await _sign_keys(entry.image_keys),
            )
            for entry in (parse_daily_markdown(markdown) if markdown else [])
        ]

        previous_day = (day.date() - timedelta(days=1)).isoformat()
        following_day = (day.date() + timedelta(days=1)).isoformat()
        return templates.TemplateResponse(
            request,
            "day.html",
            {
                "title": day_str,
                "entries": entries,
                "month": f"{day:%Y-%m}",
                "prev_day": previous_day,
                "next_day": following_day,
            },
        )

    async def _sign_keys(keys: list[str]) -> list[str]:
        urls: list[str] = []
        for key in keys:
            if validate_object_key(key) is not None:
                logger.warning("不正なR2キーを無視しました: %s", key)
                continue
            try:
                urls.append(
                    await asyncio.to_thread(
                        r2_service.generate_presigned_url,
                        key,
                        config.signed_url_expiry_seconds,
                    )
                )
            except Exception:
                logger.exception("画像URLの発行に失敗しました: key=%s", key)
        return urls

    @app.get("/tasks", response_class=HTMLResponse)
    async def tasks_view(request: Request):
        if not authed(request):
            return login_redirect()
        try:
            issues = await asyncio.to_thread(
                github_service.list_open_issues, MAX_LISTED_TASKS
            )
        except Exception:
            logger.exception("タスク一覧の取得に失敗しました")
            return Response("タスク一覧の取得に失敗しました", status_code=502)
        return templates.TemplateResponse(
            request, "tasks.html", {"title": "タスク", "issues": issues}
        )

    return app
