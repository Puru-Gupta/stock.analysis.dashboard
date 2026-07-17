import math
from datetime import datetime
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.data.fetcher import fetch_fundamentals, fetch_history, resample_ohlcv
from app.data.universes import INDEX_SYMBOL, SECTORS, UNIVERSES
from app.engines.fundamental import combine_decision, score_fundamentals
from app.engines.technical import compute_technical_scores


def get_universe_symbols(
    universe: str,
    sector: Optional[str] = None,
    custom: Optional[list[str]] = None,
) -> list[str]:
    if custom:
        return [s if s.endswith(".NS") else f"{s}.NS" for s in custom]
    if universe == "sector" and sector:
        return SECTORS.get(sector, SECTORS["IT"])
    return UNIVERSES.get(universe, UNIVERSES["nifty50"])


def analyze_equity(
    symbol: str,
    timeframe: str = "daily",
    days: int = 365,
) -> dict[str, Any]:
    df = fetch_history(symbol, days=days)
    if df.empty:
        return {"error": f"No price data for {symbol}", "symbol": symbol}

    df = resample_ohlcv(df, timeframe)
    nifty_df = fetch_history(INDEX_SYMBOL, days=days)
    nifty_df = resample_ohlcv(nifty_df, timeframe)

    technical = compute_technical_scores(df, nifty_df)
    fund_data = fetch_fundamentals(symbol)
    fundamental = score_fundamentals(fund_data)
    decision = combine_decision(technical, fundamental)

    chart_data = [
        {
            "date": row["date"].strftime("%Y-%m-%d"),
            "open": round(row["open"], 2),
            "high": round(row["high"], 2),
            "low": round(row["low"], 2),
            "close": round(row["close"], 2),
            "volume": int(row["volume"]),
        }
        for _, row in df.tail(120).iterrows()
    ]

    return {
        "symbol": symbol,
        "name": fund_data.get("name", symbol.replace(".NS", "")),
        "sector": fund_data.get("sector"),
        "timeframe": timeframe,
        **decision,
        "technical_view": "Strong" if technical["technical_score"] >= 65 else "Weak" if technical["technical_score"] < 45 else "Neutral",
        "fundamental_view": fundamental["fundamental_view"],
        "entry_zone": technical["entry_zone"],
        "stop_loss": technical["stop_loss"],
        "target1": technical["target1"],
        "target2": technical["target2"],
        "risk_reward": technical["risk_reward"],
        "invalidation": technical["invalidation"],
        "technical_signals": technical["technical_signals"],
        "fundamental_signals": fundamental["fundamental_signals"],
        "support": technical["support"],
        "resistance": technical["resistance"],
        "current_price": technical["current_price"],
        "trend": technical["trend"],
        "fundamentals": fund_data,
        "score_breakdown": {
            "trend": technical["trend_score"],
            "momentum": technical["momentum_score"],
            "volume": technical["volume_score"],
            "support_resistance": technical["sr_score"],
            "relative_strength": technical["rs_score"],
            "quality": fundamental["quality_score"],
            "valuation": fundamental["valuation_score"],
            "growth": fundamental["growth_score"],
            "debt": fundamental["debt_score"],
        },
        "chart_data": chart_data,
        "analyzed_at": datetime.now().isoformat(),
    }


def scan_universe(
    universe: str = "nifty50",
    sector: Optional[str] = None,
    custom: Optional[list[str]] = None,
    timeframe: str = "daily",
    recommendation_filter: Optional[str] = None,
    risk_level: Optional[str] = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    symbols = get_universe_symbols(universe, sector, custom)
    results = []

    for sym in symbols[:limit]:
        try:
            analysis = analyze_equity(sym, timeframe=timeframe)
            if "error" in analysis:
                continue
            if recommendation_filter and analysis["signal"].lower() != recommendation_filter.lower():
                continue
            if risk_level and analysis["risk_level"].lower() != risk_level.lower():
                continue
            results.append({
                k: v for k, v in analysis.items()
                if k not in ("chart_data", "fundamentals", "score_breakdown")
            })
        except Exception:
            continue

    results.sort(key=lambda x: x.get("final_score", 0), reverse=True)
    return results
