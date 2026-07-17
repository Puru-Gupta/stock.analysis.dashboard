from typing import Any

import numpy as np
import pandas as pd


def compute_obv(df: pd.DataFrame) -> list[float]:
    obv = [0.0]
    for i in range(1, len(df)):
        if df["close"].iloc[i] > df["close"].iloc[i - 1]:
            obv.append(obv[-1] + df["volume"].iloc[i])
        elif df["close"].iloc[i] < df["close"].iloc[i - 1]:
            obv.append(obv[-1] - df["volume"].iloc[i])
        else:
            obv.append(obv[-1])
    return obv


def find_support_resistance(df: pd.DataFrame, lookback: int = 60) -> tuple[float, float]:
    recent = df.tail(lookback)
    support = recent["low"].min()
    resistance = recent["high"].max()
    return float(support), float(resistance)


def detect_trend(df: pd.DataFrame) -> str:
    if len(df) < 30:
        return "neutral"
    closes = df["close"].tail(20)
    sma20 = df["close"].rolling(20).mean().iloc[-1]
    sma50 = df["close"].rolling(50).mean().iloc[-1] if len(df) >= 50 else sma20
    price = df["close"].iloc[-1]

    highs = df["high"].tail(10).values
    lows = df["low"].tail(10).values
    hh = sum(1 for i in range(1, len(highs)) if highs[i] > highs[i - 1])
    hl = sum(1 for i in range(1, len(lows)) if lows[i] > lows[i - 1])
    lh = sum(1 for i in range(1, len(highs)) if highs[i] < highs[i - 1])
    ll = sum(1 for i in range(1, len(lows)) if lows[i] < lows[i - 1])

    if price > sma20 > sma50 and hh >= 4 and hl >= 4:
        return "uptrend"
    if price < sma20 < sma50 and lh >= 4 and ll >= 4:
        return "downtrend"
    return "neutral"


def compute_atr(df: pd.DataFrame, period: int = 14) -> float:
    if len(df) < period + 1:
        return df["close"].std() * 0.02 if len(df) > 1 else 0
    high, low, close = df["high"], df["low"], df["close"]
    tr = pd.concat(
        [
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return float(tr.rolling(period).mean().iloc[-1])


def mvrb_metrics(df: pd.DataFrame, nifty_df: pd.DataFrame) -> dict[str, Any]:
    """MVRB strategy from mvsp.py: momentum, volume, relative strength, breakout."""
    if len(df) < 22:
        return {}

    price_today = df["close"].iloc[-1]
    price_1m = df["close"].iloc[-22]
    price_3m = df["close"].iloc[0] if len(df) >= 60 else df["close"].iloc[0]

    ret_1m = (price_today - price_1m) / price_1m * 100
    ret_3m = (price_today - price_3m) / price_3m * 100

    vol_today = df["volume"].iloc[-1]
    vol_avg = df["volume"].rolling(20).mean().iloc[-1]
    vol_ratio = vol_today / vol_avg if vol_avg else 0

    max_price = df["close"].max()
    near_breakout = (price_today / max_price) > 0.95 if max_price else False

    rs_score = 1.0
    if not nifty_df.empty and len(nifty_df) >= 2:
        nifty_ret = (nifty_df["close"].iloc[-1] - nifty_df["close"].iloc[0]) / nifty_df["close"].iloc[0] * 100
        rs_score = ret_3m / nifty_ret if nifty_ret else 1.0

    return {
        "ret_1m": round(ret_1m, 2),
        "ret_3m": round(ret_3m, 2),
        "vol_ratio": round(vol_ratio, 2),
        "near_52w_high": near_breakout,
        "rs_vs_nifty": round(rs_score, 2),
    }


def accumulation_breakout(df: pd.DataFrame) -> dict[str, Any]:
    """BB width consolidation + volume accumulation from mvsp.py."""
    if len(df) < 30:
        return {"signal": False}

    df = df.copy()
    df["close_20sma"] = df["close"].rolling(20).mean()
    df["volume_20sma"] = df["volume"].rolling(20).mean()
    std20 = df["close"].rolling(20).std()
    df["bb_upper"] = df["close_20sma"] + 2 * std20
    df["bb_lower"] = df["close_20sma"] - 2 * std20
    df["bb_width"] = df["bb_upper"] - df["bb_lower"]

    latest = df.iloc[-1]
    if latest.isnull().any():
        return {"signal": False}

    bb_width_avg = df["bb_width"].rolling(20).mean().iloc[-1]
    price_consolidation = latest["bb_width"] < bb_width_avg * 0.75 if bb_width_avg else False
    volume_accum = latest["volume"] > latest["volume_20sma"] * 1.3
    near_20sma = abs(latest["close"] - latest["close_20sma"]) / latest["close_20sma"] < 0.03
    not_at_high = latest["close"] < df["close"].max() * 0.95

    signal = price_consolidation and volume_accum and near_20sma and not_at_high
    return {
        "signal": bool(signal),
        "price_consolidation": price_consolidation,
        "volume_accumulation": volume_accum,
        "near_20sma": near_20sma,
        "pre_breakout": not_at_high,
        "bb_width": round(float(latest["bb_width"]), 2),
    }


def obv_accumulation(df: pd.DataFrame) -> dict[str, Any]:
    """OBV divergence + volume spike from mvsp.py."""
    if len(df) < 60:
        return {"signal": False}

    df = df.copy()
    df["obv"] = compute_obv(df)

    price_change = df["close"].iloc[-1] - df["close"].iloc[-15]
    obv_change = df["obv"].iloc[-1] - df["obv"].iloc[-15]

    avg_vol_20 = df["volume"].iloc[-20:].mean()
    avg_vol_60 = df["volume"].iloc[-60:].mean()
    volume_spike = avg_vol_20 > 1.5 * avg_vol_60

    obv_divergence = obv_change > 0 and price_change <= 0
    near_52w = df["close"].iloc[-1] >= 0.9 * df["close"].max()

    signal = volume_spike or obv_divergence
    return {
        "signal": bool(signal),
        "obv_divergence": obv_divergence,
        "volume_spike": volume_spike,
        "near_52w_high": near_52w,
    }


def compute_technical_scores(
    df: pd.DataFrame,
    nifty_df: pd.DataFrame,
) -> dict[str, Any]:
    mvrb = mvrb_metrics(df, nifty_df)
    accum = accumulation_breakout(df)
    obv = obv_accumulation(df)
    trend = detect_trend(df)
    support, resistance = find_support_resistance(df)
    atr = compute_atr(df)
    price = float(df["close"].iloc[-1])

    trend_score = 50
    if trend == "uptrend":
        trend_score = 80
    elif trend == "downtrend":
        trend_score = 25

    momentum_score = 50
    if mvrb:
        if mvrb.get("ret_3m", 0) > 15:
            momentum_score = 85
        elif mvrb.get("ret_3m", 0) > 10:
            momentum_score = 75
        elif mvrb.get("ret_3m", 0) > 5:
            momentum_score = 65
        elif mvrb.get("ret_3m", 0) < -10:
            momentum_score = 20
        elif mvrb.get("ret_3m", 0) < -5:
            momentum_score = 30

    volume_score = 50
    if mvrb and mvrb.get("vol_ratio", 0) > 1.5:
        volume_score = 85
    elif mvrb and mvrb.get("vol_ratio", 0) > 1.2:
        volume_score = 70
    elif mvrb and mvrb.get("vol_ratio", 0) > 1.0:
        volume_score = 60
    elif mvrb and mvrb.get("vol_ratio", 0) < 0.7:
        volume_score = 35

    sr_score = 50
    dist_to_res = (resistance - price) / price * 100
    dist_to_sup = (price - support) / price * 100
    if dist_to_res < 2 and trend == "uptrend":
        sr_score = 75
    elif dist_to_sup < 3 and trend == "uptrend":
        sr_score = 70
    elif dist_to_res < 1:
        sr_score = 65

    rs_score_val = 50
    if mvrb:
        rs = mvrb.get("rs_vs_nifty", 1)
        if rs > 1.2:
            rs_score_val = 85
        elif rs > 1.0:
            rs_score_val = 75
        elif rs > 0.9:
            rs_score_val = 65
        elif rs < 0.8:
            rs_score_val = 35

    breakout_bonus = 10 if accum.get("signal") else 0
    obv_bonus = 8 if obv.get("signal") else 0
    breakout_flag = mvrb.get("near_52w_high", False) if mvrb else False
    breakout_bonus += 5 if breakout_flag else 0

    raw_technical = (
        trend_score * 0.25
        + momentum_score * 0.2
        + volume_score * 0.15
        + sr_score * 0.15
        + rs_score_val * 0.15
        + min(breakout_bonus + obv_bonus, 15)
    )
    technical_score = min(100, max(0, round(raw_technical)))

    if trend == "uptrend" and price > support:
        entry_low = round(price - atr * 0.3, 2)
        entry_high = round(price + atr * 0.1, 2)
        stop_loss = round(support - atr * 0.5, 2)
        target1 = round(resistance, 2)
        target2 = round(price + (resistance - price) * 1.5, 2) if resistance > price else round(price + atr * 2, 2)
    elif trend == "downtrend":
        entry_low = round(price - atr * 0.2, 2)
        entry_high = round(price, 2)
        stop_loss = round(resistance + atr * 0.3, 2)
        target1 = round(support, 2)
        target2 = round(support - atr, 2)
    else:
        entry_low = round(support, 2)
        entry_high = round(price, 2)
        stop_loss = round(support - atr * 0.5, 2)
        target1 = round(resistance, 2)
        target2 = round((price + resistance) / 2, 2)

    risk = abs(price - stop_loss)
    reward = abs(target1 - price)
    rr_ratio = round(reward / risk, 2) if risk > 0 else 0

    signals = []
    if trend == "uptrend":
        signals.append("Price in uptrend with higher highs/lows")
    elif trend == "downtrend":
        signals.append("Price in downtrend")
    if mvrb:
        if mvrb.get("ret_3m", 0) > 10:
            signals.append(f"Strong 3M momentum: {mvrb['ret_3m']}%")
        if mvrb.get("vol_ratio", 0) > 1.2:
            signals.append(f"Volume above average: {mvrb['vol_ratio']}x")
        if mvrb.get("rs_vs_nifty", 0) > 1:
            signals.append(f"Outperforming Nifty (RS: {mvrb['rs_vs_nifty']})")
        if mvrb.get("near_52w_high"):
            signals.append("Trading near 52-week high")
    if accum.get("signal"):
        signals.append("Consolidation with volume accumulation — potential breakout")
    if obv.get("obv_divergence"):
        signals.append("OBV rising while price flat — accumulation signal")
    if obv.get("volume_spike"):
        signals.append("Recent volume spike vs 60-day average")

    return {
        "technical_score": technical_score,
        "trend": trend,
        "trend_score": trend_score,
        "momentum_score": momentum_score,
        "volume_score": volume_score,
        "sr_score": sr_score,
        "rs_score": rs_score_val,
        "mvrb": mvrb,
        "accumulation": accum,
        "obv": obv,
        "support": support,
        "resistance": resistance,
        "atr": round(atr, 2),
        "current_price": price,
        "entry_zone": [entry_low, entry_high],
        "stop_loss": stop_loss,
        "target1": target1,
        "target2": target2,
        "risk_reward": rr_ratio,
        "technical_signals": signals,
        "invalidation": f"Close below ₹{stop_loss}" if trend != "downtrend" else f"Close above ₹{stop_loss}",
    }
