from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.models import IssueSummary
from app.web_app import create_app, shift_month
from app.web_auth import MAX_FAILED_ATTEMPTS, SessionStore
from tests.test_config import _make_config
from tests.test_diary import MARKDOWN

PASSWORD = "correct-horse-battery"


@pytest.fixture
def services():
    github = MagicMock()
    github.list_dates_in_month.return_value = ["2026-07-26", "2026-07-19"]
    github.fetch_daily_markdown.return_value = MARKDOWN
    github.list_open_issues.return_value = [
        IssueSummary(number=7, title="オイル交換", url="https://github.com/o/r/issues/7")
    ]
    r2 = MagicMock()
    r2.generate_presigned_url.side_effect = lambda key, expiry: f"https://signed/{key}"
    return github, r2


@pytest.fixture
def client(services):
    github, r2 = services
    config = _make_config(web_enabled=True, web_password=PASSWORD)
    return TestClient(create_app(config, github, r2), follow_redirects=False)


def _login(client) -> None:
    response = client.post("/login", data={"password": PASSWORD})
    assert response.status_code == 303


def test_shift_month_wraps_year_boundaries():
    assert shift_month(2026, 1, -1) == (2025, 12)
    assert shift_month(2026, 12, 1) == (2027, 1)


@pytest.mark.parametrize("path", ["/", "/month/2026-07", "/day/2026-07-26", "/tasks"])
def test_pages_require_login(client, path):
    response = client.get(path)
    assert response.status_code == 303
    assert response.headers["location"] == "/login"


def test_login_rejects_wrong_password(client):
    response = client.post("/login", data={"password": "wrong"})
    assert response.status_code == 401
    assert "パスワードが違います" in response.text


def test_login_locks_out_after_repeated_failures(client):
    for _ in range(MAX_FAILED_ATTEMPTS):
        client.post("/login", data={"password": "wrong"})
    response = client.post("/login", data={"password": PASSWORD})
    assert response.status_code == 429


def test_login_sets_httponly_cookie(client):
    response = client.post("/login", data={"password": PASSWORD})
    assert response.status_code == 303
    assert "httponly" in response.headers["set-cookie"].lower()


def test_month_page_lists_dates(client):
    _login(client)
    response = client.get("/month/2026-07")
    assert response.status_code == 200
    assert "2026-07-26" in response.text
    assert "/day/2026-07-26" in response.text


def test_month_page_rejects_bad_format(client):
    _login(client)
    assert client.get("/month/july").status_code == 400


def test_day_page_shows_entries_and_signed_images(client, services):
    _login(client)
    response = client.get("/day/2026-07-26")

    assert response.status_code == 200
    assert "朝ランを5km走った" in response.text
    assert "https://signed/images/2026/07/26/2-photo.jpg" in response.text
    # The private key itself must never reach the page.
    assert 'src="images/2026' not in response.text


def test_day_page_skips_invalid_keys_without_signing(client, services):
    github, r2 = services
    github.fetch_daily_markdown.return_value = (
        "## 09:00\n\n本文\n\n- Discord投稿者: t\n- 添付ファイル:\n  - `../../etc/passwd`\n"
    )
    _login(client)
    response = client.get("/day/2026-07-26")

    assert response.status_code == 200
    r2.generate_presigned_url.assert_not_called()


def test_day_page_survives_image_url_failure(client, services):
    github, r2 = services
    r2.generate_presigned_url.side_effect = RuntimeError("R2 down")
    _login(client)
    response = client.get("/day/2026-07-26")

    assert response.status_code == 200
    assert "夕方に買い物へ行った" in response.text


def test_day_page_handles_missing_diary(client, services):
    github, _ = services
    github.fetch_daily_markdown.return_value = None
    _login(client)
    response = client.get("/day/2026-07-26")
    assert response.status_code == 200
    assert "この日の記録はありません" in response.text


def test_day_page_rejects_bad_format(client):
    _login(client)
    assert client.get("/day/26-07-2026").status_code == 400


def test_tasks_page_lists_open_issues(client):
    _login(client)
    response = client.get("/tasks")
    assert response.status_code == 200
    assert "#7" in response.text
    assert "オイル交換" in response.text


def test_github_failure_returns_502(client, services):
    github, _ = services
    github.list_open_issues.side_effect = RuntimeError("API down")
    _login(client)
    assert client.get("/tasks").status_code == 502


def test_logout_invalidates_session(client):
    _login(client)
    assert client.get("/tasks").status_code == 200
    client.post("/logout")
    assert client.get("/tasks").headers["location"] == "/login"


def test_session_expires(client):
    clock = {"now": 1000.0}
    store = SessionStore(session_seconds=60, now_func=lambda: clock["now"])
    token = store.create()
    assert store.is_valid(token) is True
    clock["now"] += 61
    assert store.is_valid(token) is False


def test_session_rejects_unknown_token():
    store = SessionStore(session_seconds=60)
    assert store.is_valid("not-a-real-token") is False
    assert store.is_valid(None) is False
