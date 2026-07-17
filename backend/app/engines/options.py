import math
from datetime import datetime
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.data.fetcher import fetch_history, fetch_option_chain
from app.engines.technical import compute_atr, detect_trend


def historical_volatility(df: pd.DataFrame, window: int = 20) -> float:
    if len(df) < window + 1:
        return 0.25
    returns = df["close"].pct_change().dropna()
    return float(returns.tail(window).std() * math.sqrt(252))


def expected_move(spot: float, vol: float, days: float) -> float:
    return spot * vol * math.sqrt(max(days, 1) / 365)


def prob_above_strike(spot: float, strike: float, vol: float, days: float) -> float:
    """Log-normal approximation for P(S_T > K)."""
    if vol <= 0 or days <= 0:
        return 0.5
    t = days / 365
    d2 = (math.log(spot / strike) + (-0.5 * vol ** 2) * t) / (vol * math.sqrt(t))
    return round(_norm_cdf(d2) * 100, 1)


def prob_below_strike(spot: float, strike: float, vol: float, days: float) -> float:
    return round(100 - prob_above_strike(spot, strike, vol, days), 1)


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def moneyness(spot: float, strike: float, opt_type: str) -> str:
    if opt_type == "call":
        if strike < spot * 0.99:
            return "ITM"
        if strike > spot * 1.01:
            return "OTM"
        return "ATM"
    if strike > spot * 1.01:
        return "ITM"
    if strike < spot * 0.99:
        return "OTM"
    return "ATM"


def analyze_options(
    symbol: str,
    expiry: Optional[str] = None,
    option_type: str = "call",
    strategy_mode: str = "directional",
    capital: float = 100000,
    risk_level: str = "medium",
) -> dict[str, Any]:
    chain_data = fetch_option_chain(symbol)
    spot = chain_data.get("spot")
    if not spot:
        hist = fetch_history(symbol, days=60)
        spot = float(hist["close"].iloc[-1]) if not hist.empty else None

    if not spot:
        return {"error": f"Could not fetch spot price for {symbol}", "symbol": symbol}

    expiries = chain_data.get("expiries", [])
    if not expiry and expiries:
        expiry = expiries[0]
    elif not expiry:
        expiry = "N/A"

    days_to_expiry = 30
    if expiry and expiry != "N/A":
        try:
            exp_date = datetime.strptime(expiry, "%Y-%m-%d")
            days_to_expiry = max((exp_date - datetime.now()).days, 1)
        except ValueError:
            pass

    hist = fetch_history(symbol, days=120)
    hv = historical_volatility(hist)
    trend = detect_trend(hist) if not hist.empty else "neutral"

    chain = chain_data.get("chains", {}).get(expiry, {}) if expiry != "N/A" else {}
    options = chain.get("calls" if option_type == "call" else "puts", [])

    iv_fallback = hv
    em = expected_move(spot, iv_fallback, days_to_expiry)
    expected_range = [round(spot - em, 2), round(spot + em, 2)]

    recommendations = []
    for opt in options:
        strike = opt.get("strike")
        if strike is None:
            continue
        premium = opt.get("lastPrice") or opt.get("ask") or 0
        bid = opt.get("bid") or 0
        ask = opt.get("ask") or 0
        volume = opt.get("volume") or 0
        oi = opt.get("openInterest") or 0
        iv = opt.get("impliedVolatility") or iv_fallback
        spread = (ask - bid) if ask and bid else 0
        spread_pct = spread / premium * 100 if premium else 100

        money = moneyness(spot, strike, option_type)
        prob_itm = prob_above_strike(spot, strike, iv, days_to_expiry) if option_type == "call" else prob_below_strike(spot, strike, iv, days_to_expiry)
        prob_otm = round(100 - prob_itm, 1)

        rec = {
            "strike": strike,
            "premium": round(premium, 2),
            "moneyness": money,
            "iv": round(iv * 100, 1) if iv < 5 else round(iv, 1),
            "volume": volume,
            "open_interest": oi,
            "bid_ask_spread_pct": round(spread_pct, 1),
            "prob_itm": prob_itm,
            "prob_otm": prob_otm,
            "liquidity_ok": volume > 100 and spread_pct < 15,
        }

        if strategy_mode in ("buying", "directional", "option_buying"):
            score = 0
            if trend == "uptrend" and option_type == "call":
                score += 30
            elif trend == "downtrend" and option_type == "put":
                score += 30
            if money in ("ATM", "ITM"):
                score += 25
            elif money == "OTM" and trend in ("uptrend", "downtrend"):
                score += 10
            if rec["liquidity_ok"]:
                score += 20
            if prob_itm > 40 and prob_itm < 70:
                score += 15
            if premium > 0 and premium < capital * 0.02:
                score += 10

            if score >= 60:
                rec["action"] = f"Buy {option_type.title()}"
                rec["entry_premium"] = [round(premium * 0.95, 2), round(premium * 1.05, 2)]
                rec["stop_loss"] = round(premium * 0.5, 2)
                rec["target"] = round(premium * 2, 2)
                rec["score"] = score
                rec["reason"] = f"Directional {trend} signal, {money} strike with acceptable liquidity and probability."
                rec["invalidation"] = f"Premium falls below ₹{round(premium * 0.5, 2)} or spot invalidates trend."
                recommendations.append(rec)
            else:
                rec["action"] = "Avoid"
                rec["score"] = score
                rec["reason"] = "Does not meet buying criteria — weak liquidity, probability, or trend alignment."

        elif strategy_mode in ("selling", "option_selling", "neutral"):
            score = 0
            if prob_otm > 70:
                score += 35
            if abs(strike - spot) > em * 0.8:
                score += 25
            if rec["liquidity_ok"]:
                score += 20
            if iv > hv * 1.1:
                score += 15

            if score >= 65:
                rec["action"] = f"Sell {option_type.title()}"
                rec["premium_received"] = round(premium, 2)
                rec["breakeven"] = round(strike + premium if option_type == "call" else strike - premium, 2)
                rec["stop_loss"] = round(premium * 2, 2)
                rec["score"] = score
                rec["reason"] = f"High probability ({prob_otm}%) of expiring OTM, strike outside expected move."
                rec["invalidation"] = f"Spot moves beyond expected range or premium doubles."
                rec["max_risk"] = "Undefined for naked selling — use defined-risk spreads"
                recommendations.append(rec)
            else:
                rec["action"] = "Avoid"
                rec["score"] = score

    recommendations.sort(key=lambda x: x.get("score", 0), reverse=True)
    top = recommendations[:10]

    strategy_rec = None
    if trend == "uptrend" and strategy_mode in ("directional", "buying"):
        if len(top) >= 2:
            buy = top[0]
            sell_strike = buy["strike"] + round(em / 2, -1)
            strategy_rec = {
                "name": "Bull Call Spread",
                "reason": "Bullish trend with moderate IV — defined risk vs naked call buying.",
                "legs": [
                    f"Buy {buy['strike']} CE",
                    f"Sell {sell_strike} CE",
                ],
                "max_loss": f"₹{(buy['premium'] * 0.6) * 100:.0f} per lot (approx)",
                "max_profit": f"₹{(sell_strike - buy['strike'] - buy['premium'] * 0.6) * 100:.0f} per lot (approx)",
                "risk": "Defined",
            }
    elif trend == "neutral" and strategy_mode == "neutral":
        strategy_rec = {
            "name": "Iron Condor",
            "reason": "Range-bound expected move — sell OTM call and put outside expected range.",
            "legs": [
                f"Sell {round(spot + em, -1)} CE",
                f"Buy {round(spot + em * 1.5, -1)} CE",
                f"Sell {round(spot - em, -1)} PE",
                f"Buy {round(spot - em * 1.5, -1)} PE",
            ],
            "max_loss": "Defined by wing width minus credit",
            "risk": "Defined with hedges",
        }

    return {
        "symbol": symbol,
        "spot": round(spot, 2),
        "expiry": expiry,
        "days_to_expiry": days_to_expiry,
        "historical_volatility": round(hv * 100, 1),
        "expected_move": round(em, 2),
        "expected_range": expected_range,
        "trend": trend,
        "option_type": option_type,
        "strategy_mode": strategy_mode,
        "recommendations": top,
        "strategy": strategy_rec,
        "chain_available": bool(options),
        "data_source": chain_data.get("source", "yfinance"),
        "note": "Indian NSE option chains may have limited yfinance data. Architecture supports NSE provider integration.",
        "analyzed_at": datetime.now().isoformat(),
    }
