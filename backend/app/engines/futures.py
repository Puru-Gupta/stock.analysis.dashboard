from datetime import datetime
from typing import Any, Optional

import pandas as pd

from app.data.fetcher import fetch_history, resample_ohlcv
from app.engines.technical import compute_atr, compute_technical_scores, detect_trend, find_support_resistance


STRATEGIES = {
    "trend_following": "Trend-Following",
    "pullback": "Pullback",
    "breakout": "Breakout",
    "mean_reversion": "Mean Reversion",
    "volatility_expansion": "Volatility Expansion",
}


def _range_compression(df: pd.DataFrame, window: int = 10) -> bool:
    if len(df) < window * 2:
        return False
    recent_range = df["high"].tail(window).max() - df["low"].tail(window).min()
    prior_range = df["high"].iloc[-window * 2:-window].max() - df["low"].iloc[-window * 2:-window].min()
    return recent_range < prior_range * 0.7 if prior_range else False


def analyze_futures(
    symbol: str,
    timeframe: str = "daily",
    strategy_mode: str = "trend_following",
    risk_level: str = "medium",
    capital: float = 500000,
    days: int = 180,
) -> dict[str, Any]:
    if not symbol.endswith(".NS") and symbol in ("NIFTY", "BANKNIFTY"):
        symbol = "^NSEI" if symbol == "NIFTY" else "^NSEBANK"

    df = fetch_history(symbol, days=days)
    if df.empty:
        return {"error": f"No futures/price data for {symbol}", "symbol": symbol}

    df = resample_ohlcv(df, timeframe)
    nifty_df = fetch_history("^NSEI", days=days)
    technical = compute_technical_scores(df, nifty_df)

    trend = technical["trend"]
    price = technical["current_price"]
    support = technical["support"]
    resistance = technical["resistance"]
    atr = technical["atr"]
    vol_ratio = technical.get("mvrb", {}).get("vol_ratio", 1)

    signal = "Watch"
    strategy = STRATEGIES.get(strategy_mode, "Trend-Following")
    reason = ""
    entry_zone = technical["entry_zone"]
    stop_loss = technical["stop_loss"]
    target1 = technical["target1"]
    score = 50

    if strategy_mode == "trend_following":
        if trend == "uptrend" and vol_ratio >= 1.0:
            signal = "Long"
            score = 75
            reason = "Clear uptrend with volume support — trend-following long setup."
            stop_loss = round(support - atr * 0.3, 2)
            target1 = round(price + (price - stop_loss) * 2, 2)
        elif trend == "downtrend" and vol_ratio >= 1.0:
            signal = "Short"
            score = 75
            reason = "Clear downtrend with volume — trend-following short setup."
            stop_loss = round(resistance + atr * 0.3, 2)
            target1 = round(price - (stop_loss - price) * 2, 2)
        else:
            signal = "Watch"
            score = 45
            reason = "No clear trend with volume confirmation — wait."

    elif strategy_mode == "breakout":
        compressed = _range_compression(df)
        broke_up = price > resistance * 0.998
        broke_down = price < support * 1.002
        if compressed and broke_up and vol_ratio > 1.2:
            signal = "Long"
            score = 80
            reason = "Range compression followed by upside breakout with volume confirmation."
            entry_zone = [round(resistance * 0.995, 2), round(price, 2)]
            stop_loss = round(resistance - atr * 0.5, 2)
            target1 = round(price + (resistance - support), 2)
        elif compressed and broke_down and vol_ratio > 1.2:
            signal = "Short"
            score = 80
            reason = "Range compression followed by downside breakdown with volume."
            stop_loss = round(support + atr * 0.5, 2)
            target1 = round(price - (resistance - support), 2)
        else:
            signal = "Watch"
            score = 40
            reason = "No confirmed breakout — range still intact."

    elif strategy_mode == "pullback":
        sma20 = df["close"].rolling(20).mean().iloc[-1]
        dist_sma = abs(price - sma20) / sma20 * 100
        if trend == "uptrend" and dist_sma < 3 and price > support:
            signal = "Long"
            score = 72
            reason = "Controlled pullback to support/SMA within intact uptrend."
            entry_zone = [round(support, 2), round(sma20, 2)]
            stop_loss = round(support - atr * 0.4, 2)
            target1 = round(resistance, 2)
        elif trend == "downtrend" and dist_sma < 3 and price < resistance:
            signal = "Short"
            score = 72
            reason = "Pullback to resistance within downtrend — short setup."
            stop_loss = round(resistance + atr * 0.4, 2)
            target1 = round(support, 2)
        else:
            signal = "Watch"
            score = 42
            reason = "Pullback conditions not met — trend or entry zone unclear."

    elif strategy_mode == "volatility_expansion":
        compressed = _range_compression(df)
        atr_prev = compute_atr(df.iloc[:-5]) if len(df) > 20 else atr
        expanding = atr > atr_prev * 1.15
        if compressed and expanding:
            if price > df["close"].iloc[-5]:
                signal = "Long"
                score = 70
                reason = "Volatility expanding after compression — bullish breakout bias."
            else:
                signal = "Short"
                score = 70
                reason = "Volatility expanding after compression — bearish breakdown bias."
            stop_loss = round(price - atr if signal == "Long" else price + atr, 2)
            target1 = round(price + atr * 2 if signal == "Long" else price - atr * 2, 2)
        else:
            signal = "Watch"
            score = 38
            reason = "Volatility not yet expanding from compression."

    elif strategy_mode == "mean_reversion":
        dist_res = (resistance - price) / price * 100
        dist_sup = (price - support) / price * 100
        overextended_up = dist_res < 1 and trend != "uptrend"
        overextended_down = dist_sup < 1 and trend != "downtrend"
        if overextended_up:
            signal = "Short"
            score = 60
            reason = "Price stretched near resistance — mean reversion short with strict stop."
            stop_loss = round(resistance + atr * 0.3, 2)
            target1 = round((price + support) / 2, 2)
        elif overextended_down:
            signal = "Long"
            score = 60
            reason = "Price stretched near support — mean reversion long with strict stop."
            stop_loss = round(support - atr * 0.3, 2)
            target1 = round((price + resistance) / 2, 2)
        else:
            signal = "Avoid"
            score = 35
            reason = "Not sufficiently stretched for mean reversion — avoid forced trades."

    risk = abs(price - stop_loss)
    reward = abs(target1 - price)
    rr = round(reward / risk, 2) if risk > 0 else 0

    if rr < 1.5 and signal in ("Long", "Short"):
        score -= 10
        if risk_level == "low":
            signal = "Watch"
            reason += " Risk/reward below 1.5 — not suitable for low-risk profile."

    if signal == "Long" and score >= 65:
        recommendation = "Long"
    elif signal == "Short" and score >= 65:
        recommendation = "Short"
    elif signal == "Watch":
        recommendation = "Watch"
    else:
        recommendation = "Avoid"

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
        "timeframe": timeframe,
        "strategy": strategy,
        "strategy_mode": strategy_mode,
        "signal": recommendation,
        "score": min(100, max(0, score)),
        "trend_condition": trend,
        "volatility_condition": "Expanding" if atr > compute_atr(df.iloc[:-10]) else "Normal",
        "entry_zone": entry_zone,
        "stop_loss": stop_loss,
        "target": target1,
        "target2": technical["target2"],
        "risk_reward": rr,
        "reason": reason,
        "invalidation": f"Close below ₹{stop_loss}" if recommendation == "Long" else f"Close above ₹{stop_loss}" if recommendation == "Short" else "N/A",
        "risk_level": risk_level,
        "confidence": "High" if score >= 75 else "Medium" if score >= 60 else "Low",
        "current_price": price,
        "support": support,
        "resistance": resistance,
        "chart_data": chart_data,
        "analyzed_at": datetime.now().isoformat(),
    }
