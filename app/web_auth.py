"""Password login and in-memory sessions for the web viewer.

Sessions live in memory: a restart signs everyone out, which is an
acceptable trade for having no session store and no signing key to
manage. The bot runs as a single process, so there is nothing to share.
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

SESSION_COOKIE = "hearth_session"
# Slows down brute force without locking the owner out for long.
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 300


@dataclass
class _Session:
    expires_at: float


class SessionStore:
    def __init__(self, *, session_seconds: int, now_func=time.time):
        self._sessions: dict[str, _Session] = {}
        self._session_seconds = session_seconds
        self._now = now_func
        self._failures: list[float] = []

    def is_locked_out(self) -> bool:
        cutoff = self._now() - LOCKOUT_SECONDS
        self._failures = [t for t in self._failures if t > cutoff]
        return len(self._failures) >= MAX_FAILED_ATTEMPTS

    def record_failure(self) -> None:
        self._failures.append(self._now())

    def verify_password(self, expected: str, supplied: str) -> bool:
        """Constant-time compare so the password can't be timed out byte by byte."""
        return secrets.compare_digest(expected, supplied)

    def create(self) -> str:
        token = secrets.token_urlsafe(32)
        self._sessions[token] = _Session(expires_at=self._now() + self._session_seconds)
        self._failures.clear()
        return token

    def is_valid(self, token: str | None) -> bool:
        if not token:
            return False
        session = self._sessions.get(token)
        if session is None:
            return False
        if session.expires_at <= self._now():
            del self._sessions[token]
            return False
        return True

    def destroy(self, token: str | None) -> None:
        if token:
            self._sessions.pop(token, None)
