#!/usr/bin/env python3
"""CLI for Node.js to fetch market data via yahooquery/yfinance when direct Yahoo HTTP is rate-limited."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow importing app.* from backend root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data.fetcher import fetch_fundamentals, fetch_history  # noqa: E402


def _emit(payload: object) -> None:
    print(json.dumps(payload, default=str))


def cmd_history(symbol: str, days: int) -> None:
    df = fetch_history(symbol, days=days, use_cache=True)
    if df.empty:
        _emit([])
        return
    bars = []
    for _, row in df.iterrows():
        date_val = row["date"]
        date_str = date_val.strftime("%Y-%m-%d") if hasattr(date_val, "strftime") else str(date_val)[:10]
        bars.append(
            {
                "date": date_str,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"] or 0),
            }
        )
    _emit(bars)


def cmd_fundamentals(symbol: str) -> None:
    data = fetch_fundamentals(symbol, use_cache=True)
    cleaned = {k: v for k, v in data.items() if v is not None}
    _emit(cleaned)


def main() -> None:
    if len(sys.argv) < 3:
        _emit({"error": "usage: market_data_cli.py <history|fundamentals> <symbol> [days]"})
        sys.exit(1)

    command = sys.argv[1]
    symbol = sys.argv[2]

    if command == "history":
        days = int(sys.argv[3]) if len(sys.argv) > 3 else 365
        cmd_history(symbol, days)
    elif command == "fundamentals":
        cmd_fundamentals(symbol)
    else:
        _emit({"error": f"unknown command: {command}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
