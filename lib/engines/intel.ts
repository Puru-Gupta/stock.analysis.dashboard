/**
 * Trade advantages + strategy mode detail cards for equity/options decisions.
 */

import type { ModeDetails, TradeAdvantage } from "../data/agents/types";
import type { DataQualityReport } from "../data/agents/types";

export function buildEquityAdvantages(analysis: {
  signal: string;
  technical_score: number;
  fundamental_score: number;
  risk_reward: number;
  trend: string;
  technical_signals: string[];
  fundamental_signals: string[];
  signal_diagnostics?: {
    active_setups?: string[];
    obv?: { obv_divergence?: boolean };
    accumulation?: { volume_accumulation?: boolean; signal?: boolean };
  };
  quality?: DataQualityReport;
}): TradeAdvantage[] {
  const adv: TradeAdvantage[] = [];
  const setups = analysis.signal_diagnostics?.active_setups || [];

  if (analysis.risk_reward >= 2) {
    adj(adv, "Asymmetric R:R", `Risk/reward 1:${analysis.risk_reward} — payoff skew favors defined-risk entries.`, "high");
  }
  if (analysis.technical_score >= 65 && analysis.fundamental_score >= 55) {
    adj(adv, "Tech + Fund confluence", "Both engines clear institutional floors (tech≥65, fund≥55).", "high");
  }
  if (setups.includes("macd_cross") || setups.includes("adx_ema_trend")) {
    adj(adv, "MACD / ADX trend stack", "Public systematic filters (MACD cross + ADX/EMA) confirmed.", "edge");
  }
  if (setups.includes("bb_squeeze_breakout")) {
    adj(adv, "BB squeeze breakout", "Bollinger compression with rising MACD — breakout edge.", "edge");
  }
  if (setups.includes("obv_accumulation") || analysis.signal_diagnostics?.obv?.obv_divergence) {
    adj(adv, "OBV accumulation", "Volume leading price — classic stealth accumulation edge on NSE names.", "edge");
  }
  if (setups.includes("volume_breakout_setup") || analysis.signal_diagnostics?.accumulation?.signal) {
    adj(adv, "Pre-breakout volume", "Rising volume near resistance without full breakout yet — early entry window.", "edge");
  }
  if (analysis.trend === "uptrend" && analysis.signal === "Buy") {
    adj(adv, "Trend alignment", "Long bias matches primary trend — lower counter-trend washout risk.", "medium");
  }
  if ((analysis.quality?.accuracy_score || 0) >= 80) {
    adj(adv, "Multi-source price lock", `Data accuracy ${analysis.quality!.accuracy_score}/100 across ${analysis.quality!.sources_used.length} agents.`, "medium");
  }
  if (analysis.fundamental_signals.some((s) => /ROE|margin|cash flow/i.test(s))) {
    adj(adv, "Quality fundamental backdrop", analysis.fundamental_signals[0], "medium");
  }
  if (!adv.length) {
    adj(adv, "Watchlist posture", "No high-conviction edge yet — wait for setup confirmation or clearer R:R.", "medium");
  }
  return adv.slice(0, 5);
}

function adj(list: TradeAdvantage[], title: string, detail: string, weight: TradeAdvantage["weight"]) {
  list.push({ title, detail, weight });
}

const MODE_CATALOG: Record<string, ModeDetails> = {
  directional: {
    mode: "directional",
    label: "Directional (Buy premium)",
    objective: "Capture a move in the underlying with limited capital via long calls/puts.",
    when_to_use: [
      "Clear trend (uptrend → calls, downtrend → puts)",
      "Catalyst or breakout with rising volume",
      "IV not extremely elevated (avoid buying expensive premium)",
    ],
    advantages: ["Defined max loss (premium paid)", "High leverage vs cash equity", "Clean expression of directional view"],
    risks: ["Time decay (theta)", "IV crush after events", "Wrong-way moves wipe premium fast"],
    invalidation: "Thesis fails if trend reverses or premium hits stop (~50% of entry).",
    best_for: "Swing traders with a strong directional bias and defined risk budget.",
  },
  selling: {
    mode: "selling",
    label: "Premium Selling",
    objective: "Collect theta by selling OTM options when probability of OTM expiry is high.",
    when_to_use: [
      "Extended rally then pause (sell calls)",
      "Range-bound / mean-reverting tape",
      "Elevated IV you expect to compress",
    ],
    advantages: ["Positive theta", "Higher win-rate setups", "Works in sideways India cash markets"],
    risks: ["Undefined risk if naked", "Gap risk on NSE news", "Assignment / delivery risk"],
    invalidation: "Exit if spot threatens breakeven or OI flips aggressively against you.",
    best_for: "Income strategies, covered calls, cash-secured puts on liquid F&O names.",
  },
  neutral: {
    mode: "neutral",
    label: "Neutral / Range",
    objective: "Profit from low realized move via iron condors / short straddles with wings.",
    when_to_use: [
      "15d and 30d ranges compressed",
      "No major event in next expiry window",
      "India VIX calm relative to recent history",
    ],
    advantages: ["Defined risk with wings", "Harvests IV + theta", "Does not need a directional call"],
    risks: ["Trend day blows through short strikes", "Wide expected move → poor credit", "Pin risk near expiry"],
    invalidation: "Adjust or exit if spot exits expected range or IV expands sharply.",
    best_for: "Range-bound large-caps and index expiries with clear support/resistance.",
  },
  trend_following: {
    mode: "trend_following",
    label: "Trend Following (Futures)",
    objective: "Ride NSE futures along the dominant trend with ATR-based stops.",
    when_to_use: ["Higher-high / higher-low structure", "Strong relative strength vs Nifty", "Pullbacks into EMA/VWAP support"],
    advantages: ["Captures large trending moves", "Clear invalidation via structure breaks", "Works well on index futures"],
    risks: ["Whipsaws in chop", "Overnight gaps", "Leverage amplifies drawdowns"],
    invalidation: "Close if swing structure breaks or stop is tagged.",
    best_for: "Nifty/BankNifty and liquid stock futures in trending regimes.",
  },
};

export function getModeDetails(mode: string): ModeDetails {
  const key = mode.includes("sell") ? "selling" : mode;
  return (
    MODE_CATALOG[key] ||
    MODE_CATALOG.directional || {
      mode,
      label: mode,
      objective: "Custom strategy mode.",
      when_to_use: [],
      advantages: [],
      risks: [],
      invalidation: "",
      best_for: "",
    }
  );
}

export function buildOptionsAdvantages(opts: {
  suitability: string;
  strategyMode: string;
  movement15d: number;
  hv: number;
  chainAvailable: boolean;
  quality?: DataQualityReport;
  currentIv?: number;
  ivHvRatio?: number;
  daysToExpiry?: number;
  topTheta?: number;
}): TradeAdvantage[] {
  const adv: TradeAdvantage[] = [];
  if (opts.suitability === "favorable") {
    adj(adv, "Mode fit", `Price action favors ${opts.strategyMode} for this expiry window.`, "high");
  }
  if (opts.chainAvailable) {
    adj(adv, "Live NSE chain", "Using live NSE option-chain prints (OI, LTP, IV) — not synthetic premiums.", "edge");
  }
  if (Math.abs(opts.movement15d) < 3 && opts.strategyMode.includes("sell")) {
    adj(adv, "Low realized move", "Tight 15d range — theta selling has structural edge.", "high");
  }
  if (opts.ivHvRatio && opts.ivHvRatio > 1.1 && opts.strategyMode.includes("sell")) {
    adj(adv, "IV > HV", `ATM IV ${((opts.currentIv || 0) * 100).toFixed(0)}% vs HV ${(opts.hv * 100).toFixed(0)}% — richer premium for sellers.`, "high");
  }
  if (opts.topTheta != null && opts.strategyMode.includes("sell") && opts.topTheta < 0) {
    adj(adv, "Time decay (theta)", `Top strike decays ~₹${Math.abs(opts.topTheta).toFixed(2)}/day (${opts.daysToExpiry ?? "—"} DTE) — seller collects theta.`, "medium");
  }
  if (opts.hv > 0.22 && opts.strategyMode.includes("sell")) {
    adj(adv, "Elevated HV", `HV ${(opts.hv * 100).toFixed(0)}% — richer premium for sellers if IV holds.`, "medium");
  }
  if ((opts.quality?.accuracy_score || 0) >= 75) {
    adj(adv, "Spot consensus", `Underlying locked via multi-agent consensus (${opts.quality!.accuracy_score}/100).`, "medium");
  }
  if (!adv.length) {
    adj(adv, "Cautious stance", "Mixed tape — size down or wait for clearer mode fit.", "medium");
  }
  return adv.slice(0, 5);
}
