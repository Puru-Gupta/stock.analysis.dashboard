from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np
import pandas as pd
import yfinance as yf
from yahooquery import Ticker

from app.cache import cache_key, get_cached, set_cached


def _normalize_history(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    if isinstance(df.index, pd.MultiIndex):
        df = df.reset_index()

    if "symbol" in df.columns:
        df = df[df["symbol"] == symbol].copy()
    elif "Symbol" in df.columns:
        df = df[df["Symbol"] == symbol].copy()

    rename_map = {
        "Date": "date",
        "Open": "open",
        "High": "high",
        "Low": "low",
        "Close": "close",
        "Volume": "volume",
        "Adj Close": "adj_close",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    required = ["date", "open", "high", "low", "close", "volume"]
    if not all(c in df.columns for c in required):
        return pd.DataFrame()

    df = df[required].dropna()
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
    return df.sort_values("date").reset_index(drop=True)


def fetch_history(
    symbol: str,
    days: int = 365,
    interval: str = "1d",
    use_cache: bool = True,
) -> pd.DataFrame:
    key = cache_key("hist", symbol, str(days), interval)
    if use_cache:
        cached = get_cached(key)
        if cached is not None:
            return pd.DataFrame(cached)

    end = datetime.today()
    start = end - timedelta(days=days)

    try:
        # Prefer yfinance first (more reliable session handling)
        ticker = yf.Ticker(symbol)
        yf_hist = ticker.history(
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            interval=interval,
            auto_adjust=False,
        )
        if yf_hist is not None and not yf_hist.empty:
            yf_hist = yf_hist.reset_index()
            yf_hist["symbol"] = symbol
            df = _normalize_history(yf_hist, symbol)
        if df.empty:
            t = Ticker(symbol)
            hist = t.history(
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                interval=interval,
            )
            df = _normalize_history(hist, symbol)
    except Exception:
        return pd.DataFrame()

    if not df.empty and use_cache:
        set_cached(key, df.to_dict(orient="records"), ttl=1800)
    return df


def resample_ohlcv(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if df.empty or timeframe == "daily":
        return df

    df = df.set_index("date")
    rule = "W-FRI" if timeframe == "weekly" else "ME"
    agg = df.resample(rule).agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    return agg.dropna().reset_index()


def fetch_fundamentals(symbol: str, use_cache: bool = True) -> dict[str, Any]:
    key = cache_key("fund", symbol)
    if use_cache:
        cached = get_cached(key)
        if cached is not None:
            return cached

    data: dict[str, Any] = {"symbol": symbol}
    try:
        t = Ticker(symbol)
        summary = t.summary_detail.get(symbol, {}) or {}
        stats = t.key_stats.get(symbol, {}) or {}
        profile = t.asset_profile.get(symbol, {}) or {}
        fin = t.financial_data.get(symbol, {}) or {}

        data.update(
            {
                "name": profile.get("longName") or symbol.replace(".NS", ""),
                "sector": profile.get("sector"),
                "industry": profile.get("industry"),
                "market_cap": summary.get("marketCap"),
                "pe_ratio": summary.get("trailingPE"),
                "forward_pe": summary.get("forwardPE"),
                "pb_ratio": summary.get("priceToBook"),
                "dividend_yield": summary.get("dividendYield"),
                "eps": stats.get("trailingEps"),
                "revenue_growth": fin.get("revenueGrowth"),
                "earnings_growth": fin.get("earningsGrowth"),
                "profit_margin": fin.get("profitMargins"),
                "operating_margin": fin.get("operatingMargins"),
                "roe": fin.get("returnOnEquity"),
                "roce": None,
                "debt_to_equity": fin.get("debtToEquity"),
                "free_cash_flow": fin.get("freeCashflow"),
                "current_ratio": fin.get("currentRatio"),
                "institutional_holding": None,
                "promoter_holding": None,
            }
        )
    except Exception:
        pass

    if use_cache:
        set_cached(key, data, ttl=86400)
    return data


def fetch_option_chain(symbol: str, use_cache: bool = True) -> dict[str, Any]:
    """Fetch option chain via yfinance. Architecture supports NSE provider later."""
    key = cache_key("options", symbol)
    if use_cache:
        cached = get_cached(key)
        if cached is not None:
            return cached

    result: dict[str, Any] = {
        "symbol": symbol,
        "spot": None,
        "expiries": [],
        "chains": {},
        "source": "yfinance",
    }

    try:
        ticker = yf.Ticker(symbol)
        expiries = list(ticker.options or [])
        result["expiries"] = expiries

        info = ticker.fast_info
        result["spot"] = getattr(info, "last_price", None) or ticker.info.get("regularMarketPrice")

        for expiry in expiries[:6]:
            chain = ticker.option_chain(expiry)
            calls = chain.calls
            puts = chain.puts
            result["chains"][expiry] = {
                "calls": calls.replace({np.nan: None}).to_dict(orient="records") if not calls.empty else [],
                "puts": puts.replace({np.nan: None}).to_dict(orient="records") if not puts.empty else [],
            }
    except Exception as e:
        result["error"] = str(e)

    if use_cache and result.get("expiries"):
        set_cached(key, result, ttl=900)
    return result
