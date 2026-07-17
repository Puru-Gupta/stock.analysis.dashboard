import type { FundamentalsData } from "@/lib/data/types";
import type { IndexRegime } from "./regime";
import type { TradeMode } from "./trade-mode";
import {
  pegApprox,
  peRelative,
  pbRelative,
  resolveSectorNorms,
} from "./sector-valuation";

function safeFloat(val: unknown, def = 0): number {
  if (val == null) return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

export function scoreFundamentals(fund: FundamentalsData) {
  let quality = 50, valuation = 50, growth = 50, debt = 50;
  const signals: string[] = [], risks: string[] = [];

  const norms = resolveSectorNorms(fund.sector, fund.industry);
  const pe = safeFloat(fund.pe_ratio, -1);
  const fpe = safeFloat(fund.forward_pe, -1);
  const pb = safeFloat(fund.pb_ratio, -1);
  const peRel = pe > 0 ? peRelative(pe, norms) : null;
  const pbRel = pb > 0 ? pbRelative(pb, norms) : null;
  const peg = pegApprox(pe > 0 ? pe : null, fund.earnings_growth);

  const roe = safeFloat(fund.roe);
  if (roe > 0.2) { quality += 20; signals.push(`Strong ROE: ${(roe * 100).toFixed(1)}%`); }
  else if (roe > 0.12) { quality += 10; signals.push(`Healthy ROE: ${(roe * 100).toFixed(1)}%`); }
  else if (roe > 0 && roe < 0.08) { quality -= 15; risks.push("Low return on equity"); }

  const pm = safeFloat(fund.profit_margin);
  if (pm > 0.15) { quality += 15; signals.push(`Strong profit margin: ${(pm * 100).toFixed(1)}%`); }
  else if (pm > 0 && pm < 0.03) { quality -= 10; risks.push("Thin profit margins"); }

  const rg = safeFloat(fund.revenue_growth);
  const eg = safeFloat(fund.earnings_growth);
  if (rg > 0.15) { growth += 25; signals.push(`Revenue growing at ${(rg * 100).toFixed(1)}%`); }
  else if (rg > 0.08) growth += 15;
  else if (rg < 0) { growth -= 20; risks.push("Declining revenue"); }
  if (eg > 0.15) { growth += 25; signals.push(`Earnings growing at ${(eg * 100).toFixed(1)}%`); }
  else if (eg < -0.1) { growth -= 25; risks.push("Earnings declining"); }

  // Sector-relative valuation (banks prefer P/B)
  if (norms.prefer_pb && pbRel != null) {
    if (pbRel <= 0.85) { valuation += 22; signals.push(`Cheap vs ${norms.sector_key} P/B (${pb.toFixed(1)} / med ${norms.pb_median})`); }
    else if (pbRel <= 1.1) { valuation += 10; signals.push(`Fair vs sector P/B (${pbRel}x median)`); }
    else if (pbRel >= 1.5) { valuation -= 22; risks.push(`Expensive vs sector P/B (${pbRel}x median)`); }
    else if (pbRel > 1.25) { valuation -= 12; risks.push(`Elevated sector-relative P/B (${pbRel}x)`); }
  } else if (peRel != null) {
    if (peRel <= 0.85) { valuation += 22; signals.push(`Cheap vs ${norms.sector_key} P/E (${pe.toFixed(1)} / med ${norms.pe_median})`); }
    else if (peRel <= 1.1) { valuation += 10; signals.push(`Fair vs sector P/E (${peRel}x median)`); }
    else if (peRel >= 1.45) { valuation -= 25; risks.push(`Expensive vs sector P/E (${peRel}x median)`); }
    else if (peRel > 1.25) { valuation -= 12; risks.push(`Elevated sector-relative P/E (${peRel}x)`); }
  } else if (pe > 0 && pe < 20) {
    valuation += 12;
    signals.push(`Absolute P/E ${pe.toFixed(1)} (no sector map — soft credit)`);
  } else if (pe > 50) {
    valuation -= 20;
    risks.push(`Elevated absolute P/E ${pe.toFixed(1)}`);
  }

  if (peg != null && peg > 0 && peg < 1) {
    valuation += 10;
    signals.push(`Attractive PEG ~${peg}`);
  } else if (peg != null && peg > 2.5) {
    valuation -= 8;
    risks.push(`Rich PEG ~${peg}`);
  }

  if (fpe > 0 && pe > 0 && fpe < pe * 0.85) {
    valuation += 10;
    signals.push("Forward earnings imply improving valuation");
  }

  const de = safeFloat(fund.debt_to_equity, -1);
  if (de >= 0 && de < 50) { debt += 20; signals.push("Manageable debt levels"); }
  else if (de > 200) { debt -= 30; risks.push(`High debt-to-equity: ${de.toFixed(0)}`); }
  else if (de > 100) { debt -= 15; risks.push(`Elevated debt-to-equity: ${de.toFixed(0)}`); }

  if (safeFloat(fund.free_cash_flow) > 0) { quality += 10; signals.push("Positive free cash flow"); }

  quality = Math.min(100, Math.max(0, quality));
  valuation = Math.min(100, Math.max(0, valuation));
  growth = Math.min(100, Math.max(0, growth));
  debt = Math.min(100, Math.max(0, debt));
  const fundamental_score = Math.round(quality * 0.3 + growth * 0.25 + valuation * 0.25 + debt * 0.2);
  const fundamental_view =
    fundamental_score >= 70 ? "Strong" : fundamental_score >= 55 ? "Good" : fundamental_score >= 40 ? "Average" : "Weak";

  return {
    fundamental_score,
    quality_score: quality,
    valuation_score: valuation,
    growth_score: growth,
    debt_score: debt,
    fundamental_view,
    fundamental_signals: signals,
    fundamental_risks: risks,
    sector_norms: norms,
    pe_relative: peRel,
    pb_relative: pbRel,
    peg,
  };
}

/**
 * Institutional multi-factor decision — thresholds are NOT loosened for signal count.
 */
export function combineDecision(
  technical: ReturnType<typeof import("./technical").computeTechnicalScores>,
  fundamental: ReturnType<typeof scoreFundamentals>,
  extras?: {
    regime?: IndexRegime;
    tradeMode?: TradeMode;
  },
) {
  const tech = technical.technical_score;
  const fund = fundamental.fundamental_score;
  const final_score = Math.round(tech * 0.55 + fund * 0.45);

  let recommendation = "Watchlist";
  let signal = "Watch";
  let reason = "Mixed signals — wait for clearer institutional-grade setup.";
  let horizon = "Wait";
  let confidence = "Low";
  let risk_level = "Medium";

  const techStrong = tech >= 65;
  const techElite = tech >= 70;
  const techWeak = tech < 45;
  const fundStrong = fund >= 65;
  const fundElite = fund >= 70;
  const fundWeak = fund < 45;
  const fundOk = fund >= 55;

  const rs = technical.mvrb?.rs_vs_nifty ?? 1;
  const vol = technical.mvrb?.vol_ratio ?? 0;
  const rsi = technical.rsi ?? 50;
  const rr = technical.risk_reward ?? 0;
  const trend = technical.trend;
  const setups = technical.active_setups || [];
  const confluence = technical.strategy_confluence;
  const votes = confluence?.votes_bull ?? 0;
  const regime = extras?.regime;
  const tradeMode = extras?.tradeMode ?? "none";
  const hasConfirmedSetup =
    setups.includes("obv_accumulation") ||
    setups.includes("volume_breakout_setup") ||
    setups.includes("vol_accum_breakout") ||
    setups.includes("macd_cross") ||
    setups.includes("adx_ema_trend") ||
    setups.includes("bb_squeeze_breakout");

  const modeAlignedSetup =
    tradeMode === "trend"
      ? setups.some((s) => ["mvrb_momentum", "adx_ema_trend", "macd_cross", "bb_squeeze_breakout", "vol_accum_breakout"].includes(s))
      : tradeMode === "accumulate"
        ? setups.some((s) => ["obv_accumulation", "volume_breakout_setup"].includes(s))
        : hasConfirmedSetup;

  const volumeOk = vol >= 1.2 || modeAlignedSetup || hasConfirmedSetup;
  const rsOkBuy = rs >= 1.0;
  const rsOkStrong = rs >= 1.1;
  const rrOkBuy = rr >= 1.8;
  const rrOkStrong = rr >= 2.0;
  const notOverbought = rsi <= 70;
  const indexFriendly = trend !== "downtrend";
  const bullConfluence = confluence?.bullish_confluence === true || votes >= 3;
  const regimeAllows = regime?.allows_long !== false;

  if (
    techElite &&
    fundElite &&
    trend === "uptrend" &&
    rsOkStrong &&
    vol >= 1.2 &&
    rrOkStrong &&
    notOverbought &&
    bullConfluence &&
    regimeAllows
  ) {
    recommendation = "Strong Buy";
    signal = "Buy";
    reason = `Elite confluence: tech ${tech} / fund ${fund}, RS ${rs}, vol ${vol}x, R:R 1:${rr}, ${votes} strategy votes · ${regime?.label || "regime ok"}.`;
    horizon = "3-6 months";
    confidence = "High";
    risk_level = "Low";
  } else if (
    techStrong &&
    fundOk &&
    indexFriendly &&
    rsOkBuy &&
    volumeOk &&
    rrOkBuy &&
    notOverbought &&
    regimeAllows &&
    (bullConfluence || modeAlignedSetup || hasConfirmedSetup || (trend === "uptrend" && vol >= 1.3))
  ) {
    recommendation = "Buy";
    signal = "Buy";
    reason = `Institutional Buy (${tradeMode}): tech ${tech}≥65, fund ${fund}≥55, RS ${rs}, vol ${vol}x, R:R 1:${rr}.`;
    horizon = tradeMode === "accumulate" ? "2-6 weeks" : "1-3 months";
    confidence = bullConfluence ? "High" : "Medium";
    risk_level = "Medium";
  } else if (techStrong && fundWeak) {
    recommendation = "Watchlist";
    signal = "Watch";
    reason = "Technicals strong but fundamentals weak — no Buy without fund≥55. Speculative only if you size tiny.";
    horizon = "Wait for fund repair or skip";
    confidence = "Low";
    risk_level = "High";
  } else if (
    (modeAlignedSetup || hasConfirmedSetup) &&
    tech >= 60 &&
    fundOk &&
    indexFriendly &&
    rsOkBuy &&
    vol >= 1.2 &&
    rrOkBuy &&
    notOverbought &&
    regimeAllows
  ) {
    recommendation = "Buy";
    signal = "Buy";
    reason = `Confirmed ${tradeMode} setup (${setups.join(", ")}) with tech≥60, fund≥55, volume+RS+R:R gates passed.`;
    horizon = tradeMode === "accumulate" ? "2-6 weeks" : "1-3 months";
    confidence = "Medium";
    risk_level = "Medium";
  } else if (techWeak && fundStrong) {
    recommendation = "Watchlist";
    signal = "Watch";
    reason = "Fundamentally strong but technical setup not ready — wait for trend/volume confirmation.";
    horizon = "Wait for setup";
    confidence = "Medium";
    risk_level = "Low";
  } else if (techWeak && fundWeak) {
    recommendation = "Avoid";
    signal = "Avoid";
    reason = "Weak technicals and fundamentals.";
    horizon = "N/A";
    confidence = "High";
    risk_level = "High";
  } else if (final_score < 35 || (techWeak && trend === "downtrend")) {
    recommendation = "Sell / Avoid";
    signal = "Sell";
    reason = "Poor multi-factor profile or downtrend with weak technicals — prefer exit / stay out.";
    horizon = "N/A";
    confidence = "Medium";
    risk_level = "High";
  } else if (trend === "downtrend" && tech < 50 && fund < 50) {
    recommendation = "Sell / Avoid";
    signal = "Sell";
    reason = "Downtrend with soft tech+fund (<50) — reduce / exit bias.";
    horizon = "N/A";
    confidence = "Medium";
    risk_level = "High";
  } else if (confluence?.bearish_confluence && trend === "downtrend" && final_score < 50) {
    recommendation = "Sell / Avoid";
    signal = "Sell";
    reason = `Bearish strategy confluence (${confluence.votes_bear} votes) in downtrend.`;
    horizon = "N/A";
    risk_level = "High";
  } else if (final_score >= 50 && final_score < 65) {
    recommendation = "Watchlist";
    signal = "Watch";
    reason = "Mid-zone composite — needs tech≥65 + volume/RS/R:R confluence for Buy.";
    horizon = "Wait";
    confidence = "Low";
  } else if (final_score < 50) {
    recommendation = "Avoid";
    signal = "Avoid";
    reason = "Below-average score without a qualifying Sell structure yet.";
    horizon = "N/A";
    confidence = "Medium";
    risk_level = "High";
  }

  if (signal === "Buy") {
    if (regime && !regime.allows_long) {
      signal = "Watch";
      recommendation = "Watchlist";
      reason = `Index regime veto (${regime.label}): ${regime.detail}`;
      confidence = "Medium";
      risk_level = "High";
    } else if (trend === "downtrend") {
      signal = "Avoid";
      recommendation = "Avoid";
      reason = "Downtrend hard-veto — no long Buy until trend repairs.";
      confidence = "Medium";
    } else if (rr < 1.8) {
      signal = "Watch";
      recommendation = "Watchlist";
      reason = `R:R 1:${rr} below 1.8 institutional floor — wait for better entry/stop geometry.`;
      risk_level = "High";
    } else if (rsi > 70) {
      signal = "Watch";
      recommendation = "Watchlist";
      reason = `RSI ${rsi} overbought — no fresh Buy; wait for pullback.`;
    } else if (rs < 1.0) {
      signal = "Watch";
      recommendation = "Watchlist";
      reason = `Relative strength ${rs} < 1.0 vs Nifty — underperformer blocked from Buy.`;
    } else if (vol < 1.2 && !hasConfirmedSetup && !modeAlignedSetup) {
      signal = "Watch";
      recommendation = "Watchlist";
      reason = `Volume ${vol}x < 1.2 without a confirmed setup — no Buy on thin participation.`;
    }
  }

  const risks = [...fundamental.fundamental_risks];
  if (rr < 1.8) risks.push(`Risk/reward below 1.8 (1:${rr})`);
  if (rsi > 70) risks.push(`Overbought RSI ${rsi}`);
  if (rs < 1.0) risks.push(`Underperforming Nifty (RS ${rs})`);
  if (confluence?.bollinger?.overbought) risks.push("Bollinger overbought — extension risk");
  if (valuationSoft(fundamental) && signal === "Buy") risks.push("Valuation stretched — size down");
  if (regime?.state === "risk_off") risks.push(`Index ${regime.label}: ${regime.detail}`);
  if (regime?.state === "neutral" && signal === "Buy") risks.push("Neutral index regime — size smaller than usual");

  return {
    final_score,
    technical_score: tech,
    fundamental_score: fund,
    recommendation,
    signal,
    reason,
    horizon,
    confidence,
    risk_level,
    risks,
  };
}

function valuationSoft(fundamental: ReturnType<typeof scoreFundamentals>) {
  return fundamental.valuation_score < 40;
}
