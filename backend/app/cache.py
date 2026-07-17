import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "cache"
DB_PATH = CACHE_DIR / "market_cache.db"
DEFAULT_TTL = 3600  # 1 hour


def _ensure_db() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                expires_at REAL NOT NULL
            )
            """
        )


def get_cached(key: str) -> Optional[Any]:
    _ensure_db()
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
        ).fetchone()
        if not row:
            return None
        value, expires_at = row
        if time.time() > expires_at:
            conn.execute("DELETE FROM cache WHERE key = ?", (key,))
            return None
        return json.loads(value)


def set_cached(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    _ensure_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            (key, json.dumps(value, default=str), time.time() + ttl),
        )


def cache_key(*parts: str) -> str:
    return ":".join(parts)
