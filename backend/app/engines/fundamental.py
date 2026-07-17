from typing import Any


def _safe_float(val: Any, default: float = 0) -> float:
    try:
        if val is None:
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def score_fundamentals(fund: dict[str, Any]) -> dict[str, Any]:
    quality_score = 50
    valuation_score = 50
    growth_score = 50
    debt_score = 50
    signals: list[str] = []
    risks: list[str] = []

    roe = _safe_float(fund.get("roe"))
    if roe > 0.2:
        quality_score += 20
        signals.append(f"Strong ROE: {roe*100:.1f}%")
    elif roe > 0.12:
        quality_score += 10
        signals.append(f"Healthy ROE: {roe*100:.1f}%")
    elif 0 < roe < 0.08:
        quality_score -= 15
        risks.append("Low return on equity")

    profit_margin = _safe_float(fund.get("profit_margin"))
    if profit_margin > 0.15:
        quality_score += 15
        signals.append(f"Strong profit margin: {profit_margin*100:.1f}%")
    elif profit_margin > 0.08:
        quality_score += 5
    elif 0 < profit_margin < 0.03:
        quality_score -= 10
        risks.append("Thin profit margins")

    op_margin = _safe_float(fund.get("operating_margin"))
    if op_margin > 0.2:
        quality_score += 10
        signals.append(f"Strong operating margin: {op_margin*100:.1f}%")

    revenue_growth = _safe_float(fund.get("revenue_growth"))
    earnings_growth = _safe_float(fund.get("earnings_growth"))
    if revenue_growth > 0.15:
        growth_score += 25
        signals.append(f"Revenue growing at {revenue_growth*100:.1f}%")
    elif revenue_growth > 0.08:
        growth_score += 15
    elif revenue_growth < 0:
        growth_score -= 20
        risks.append("Declining revenue")

    if earnings_growth > 0.15:
        growth_score += 25
        signals.append(f"Earnings growing at {earnings_growth*100:.1f}%")
    elif earnings_growth > 0.05:
        growth_score += 10
    elif earnings_growth < -0.1:
        growth_score -= 25
        risks.append("Earnings declining")

    pe = _safe_float(fund.get("pe_ratio"), default=-1)
    forward_pe = _safe_float(fund.get("forward_pe"), default=-1)
    pb = _safe_float(fund.get("pb_ratio"), default=-1)

    if 0 < pe < 20:
        valuation_score += 20
        signals.append(f"Reasonable P/E: {pe:.1f}")
    elif 0 < pe < 30:
        valuation_score += 5
    elif pe > 50:
        valuation_score -= 25
        risks.append(f"Expensive valuation — P/E {pe:.1f}")
    elif pe > 35:
        valuation_score -= 15
        risks.append(f"Elevated P/E: {pe:.1f}")

    if forward_pe > 0 and pe > 0 and forward_pe < pe * 0.85:
        valuation_score += 10
        signals.append("Forward earnings imply improving valuation")

    if 0 < pb < 3:
        valuation_score += 5
    elif pb > 8:
        valuation_score -= 10
        risks.append(f"High P/B ratio: {pb:.1f}")

    debt_eq = _safe_float(fund.get("debt_to_equity"), default=-1)
    if 0 <= debt_eq < 50:
        debt_score += 20
        signals.append("Manageable debt levels")
    elif 0 <= debt_eq < 100:
        debt_score += 5
    elif debt_eq > 200:
        debt_score -= 30
        risks.append(f"High debt-to-equity: {debt_eq:.0f}")
    elif debt_eq > 100:
        debt_score -= 15
        risks.append(f"Elevated debt-to-equity: {debt_eq:.0f}")

    fcf = _safe_float(fund.get("free_cash_flow"))
    if fcf > 0:
        quality_score += 10
        signals.append("Positive free cash flow")

    div_yield = _safe_float(fund.get("dividend_yield"))
    if div_yield > 0.02:
        signals.append(f"Dividend yield: {div_yield*100:.1f}%")

    quality_score = min(100, max(0, quality_score))
    valuation_score = min(100, max(0, valuation_score))
    growth_score = min(100, max(0, growth_score))
    debt_score = min(100, max(0, debt_score))

    fundamental_score = round(
        quality_score * 0.3
        + growth_score * 0.25
        + valuation_score * 0.25
        + debt_score * 0.2
    )

    if fundamental_score >= 70:
        view = "Strong"
    elif fundamental_score >= 55:
        view = "Good"
    elif fundamental_score >= 40:
        view = "Average"
    else:
        view = "Weak"

    return {
        "fundamental_score": fundamental_score,
        "quality_score": quality_score,
        "valuation_score": valuation_score,
        "growth_score": growth_score,
        "debt_score": debt_score,
        "fundamental_view": view,
        "fundamental_signals": signals,
        "fundamental_risks": risks,
    }


def combine_decision(technical: dict, fundamental: dict) -> dict[str, Any]:
    tech_score = technical.get("technical_score", 50)
    fund_score = fundamental.get("fundamental_score", 50)

    final_score = round(tech_score * 0.55 + fund_score * 0.45)

    tech_strong = tech_score >= 65
    tech_weak = tech_score < 45
    fund_strong = fund_score >= 65
    fund_weak = fund_score < 45

    if tech_strong and fund_strong:
        recommendation = "Strong Buy"
        signal = "Buy"
        reason = "Strong technical setup backed by solid fundamentals — high-quality long candidate."
        horizon = "3-6 months"
        confidence = "High"
        risk_level = "Medium"
    elif tech_strong and fund_weak:
        recommendation = "Watchlist"
        signal = "Watch"
        reason = "Technically strong but fundamentals are weak — no Buy without fund≥55."
        horizon = "Wait for fund repair or skip"
        confidence = "Low"
        risk_level = "High"
    elif tech_weak and fund_strong:
        recommendation = "Watchlist"
        signal = "Watch"
        reason = "Fundamentally strong company but technical setup not ready — wait for trend confirmation or pullback entry."
        horizon = "Wait for setup"
        confidence = "Medium"
        risk_level = "Low"
    elif tech_weak and fund_weak:
        recommendation = "Avoid"
        signal = "Avoid"
        reason = "Weak technicals and weak fundamentals — not a favorable setup."
        horizon = "N/A"
        confidence = "High"
        risk_level = "High"
    elif final_score >= 80 and tech_strong and fund_strong:
        recommendation = "Strong Buy"
        signal = "Buy"
        reason = "High composite score with favorable trend, momentum, and financial quality."
        horizon = "3-6 months"
        confidence = "High"
        risk_level = "Medium"
    elif final_score >= 65 and tech_strong and fund_score >= 55:
        recommendation = "Buy"
        signal = "Buy"
        reason = "Positive setup with tech≥65 and fund≥55."
        horizon = "1-3 months"
        confidence = "Medium"
        risk_level = "Medium"
    elif final_score >= 50:
        recommendation = "Watchlist"
        signal = "Watch"
        reason = "Mixed signals — monitor for clearer entry or fundamental improvement."
        horizon = "Wait"
        confidence = "Low"
        risk_level = "Medium"
    elif final_score >= 35:
        recommendation = "Weak / Avoid"
        signal = "Avoid"
        reason = "Below-average score with limited upside and elevated risk."
        horizon = "N/A"
        confidence = "Medium"
        risk_level = "High"
    else:
        recommendation = "Sell / Avoid"
        signal = "Sell"
        reason = "Poor technical and fundamental profile — high risk of further downside."
        horizon = "N/A"
        confidence = "High"
        risk_level = "High"

    if technical.get("trend") == "downtrend" and fund_score < 50:
        signal = "Avoid"
        recommendation = "Avoid"
        reason = "Downtrend with weak fundamentals — avoid long positions."

    if fundamental.get("valuation_score", 50) < 35 and tech_score < 55:
        signal = "Avoid"
        recommendation = "Avoid"
        reason = "Overvalued with weak momentum — poor risk/reward for new entries."

    risks = list(fundamental.get("fundamental_risks", []))
    if technical.get("risk_reward", 0) < 1.8 and signal == "Buy":
        signal = "Watch"
        recommendation = "Watchlist"
        reason = f"R:R below 1.8 institutional floor — wait for better entry geometry."
        risks.append("Risk/reward below 1.8")
        risk_level = "High"
    if technical.get("trend") == "downtrend" and signal == "Buy":
        signal = "Avoid"
        recommendation = "Avoid"
        reason = "Downtrend hard-veto — no long Buy until trend repairs."

    return {
        "final_score": final_score,
        "technical_score": tech_score,
        "fundamental_score": fund_score,
        "recommendation": recommendation,
        "signal": signal,
        "reason": reason,
        "horizon": horizon,
        "confidence": confidence,
        "risk_level": risk_level,
        "risks": risks,
    }
