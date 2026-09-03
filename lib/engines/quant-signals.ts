import type { ChainSurfaceMetrics } from "./chain-analytics";
import type { IndiaVixRegime } from "./india-vix";
import type { VolComparison } from "./vol-metrics";
import type { OptionStatsBundle } from "./option-stats";

export type QuantMode = "buy" | "sell";

export interface QuantSignalChip {
  id: string;
  label: string;
  tone: "positive" | "negative" | "neutral";
}

export interface QuantSignalBundle {
  quant_score: number;
  quant_label: string;
  quant_mode: QuantMode;
  live_iv: boolean;
  hv_gk_pct: number;
  iv_hv_gk_ratio: number | null;
  empirical_pop_pct: number | null;
  empirical_itm_pct: number | null;
  empirical_samples: number;
  empirical_strangle_survival_pct: number | null;
  india_vix: number | null;
  vix_regime: string;
  sell_size_pct: number;
  buy_size_pct: number;
  pcr_oi: number | null;
  skew_25d: number | null;
  skew_label: string;
  term_structure: string | null;
  max_pain: number | null;
  max_pain_dist_pct: number | null;
  chips: QuantSignalChip[];
  seller_action: string;
  buyer_action: string;
}

export function isBuyerStrategyMode(strategyMode?: string): boolean {
  const m = (strategyMode || "selling").toLowerCase();
  return m === "buying" || m === "directional";
}

function clampScore(score: number) {
  return Math.round(Math.min(100, Math.max(0, score)));
}

export function buildQuantSignals(input: {
  stats: Pick<OptionStatsBundle, "volatility" | "volatility_regime" | "health" | "focus">;
  volCompare: VolComparison;
  surface: ChainSurfaceMetrics | null;
  vix: IndiaVixRegime;
  empiricalPopPct: number | null;
  empiricalItmPct: number | null;
  empiricalSamples: number;
  empiricalStranglePct: number | null;
  liveIv: boolean;
  optionType: "call" | "put";
  strategyMode?: string;
  zScore1m?: number;
}): QuantSignalBundle {
  const buyer = isBuyerStrategyMode(input.strategyMode);
  if (buyer) {
    return buildBuyerQuant(input);
  }
  return buildSellerQuant(input);
}

function buildSellerQuant(input: {
  stats: Pick<OptionStatsBundle, "volatility" | "volatility_regime" | "health" | "focus">;
  volCompare: VolComparison;
  surface: ChainSurfaceMetrics | null;
  vix: IndiaVixRegime;
  empiricalPopPct: number | null;
  empiricalItmPct: number | null;
  empiricalSamples: number;
  empiricalStranglePct: number | null;
  liveIv: boolean;
  optionType: "call" | "put";
}): QuantSignalBundle {
  const { stats, volCompare, surface, vix, liveIv, optionType } = input;
  const chips: QuantSignalChip[] = [];
  let score = 50;

  if (liveIv) {
    score += 8;
    chips.push({ id: "live-iv", label: "Live NSE IV", tone: "positive" });
  } else {
    score -= 10;
    chips.push({ id: "hv-proxy", label: "HV proxy only", tone: "negative" });
  }

  const ivRank = stats.volatility.iv_rank;
  const ivHv = stats.volatility.iv_hv_ratio;
  if (!liveIv) {
    score += stats.volatility.seller_favorability * 0.15;
  } else if (ivRank >= 60 && ivHv >= 1.1) {
    score += 18;
    chips.push({ id: "rich-vol", label: `IV rank ${ivRank}%`, tone: "positive" });
  } else if (ivRank >= 45) {
    score += 8;
    chips.push({ id: "fair-vol", label: "Moderate IV rank", tone: "neutral" });
  } else {
    score -= 8;
    chips.push({ id: "cheap-vol", label: "Low IV rank", tone: "negative" });
  }

  if (volCompare.iv_hv_gk_ratio != null) {
    if (volCompare.iv_hv_gk_ratio >= 1.12) {
      score += 10;
      chips.push({ id: "gk-rich", label: `IV/GK ${volCompare.iv_hv_gk_ratio}×`, tone: "positive" });
    } else if (volCompare.iv_hv_gk_ratio < 0.95) {
      score -= 12;
      chips.push({ id: "gk-cheap", label: "IV below range vol", tone: "negative" });
    }
  } else if (volCompare.range_rich) {
    score += 5;
    chips.push({ id: "range-rich", label: "Intraday range elevated", tone: "neutral" });
  }

  const regime = stats.volatility_regime;
  if (regime === "Quiet" || regime === "Very Quiet") {
    score += 12;
    chips.push({ id: "quiet", label: `${regime} regime`, tone: "positive" });
  } else if (regime === "Elevated" || regime === "High" || regime === "Extreme") {
    score -= regime === "Extreme" ? 20 : 10;
    chips.push({ id: "hot-regime", label: `${regime} vol`, tone: "negative" });
  }

  if (stats.health.trend_label === "Sideways") {
    score += 8;
    chips.push({ id: "sideways", label: "Sideways trend", tone: "positive" });
  } else if (regime === "Extreme") {
    score -= 15;
  }

  applyFocusAndVix(score, chips, stats, vix, (s) => {
    score = s;
  });

  if (surface) {
    if (surface.term_structure === "backwardation") {
      score -= 8;
      chips.push({ id: "term-inv", label: "Near IV > far (event fear)", tone: "negative" });
    } else if (surface.term_structure === "contango") {
      score += 5;
      chips.push({ id: "term-cont", label: "Term contango", tone: "positive" });
    }

    if (surface.skew_25d != null && surface.skew_25d > 4 && optionType === "put") {
      score -= 6;
      chips.push({ id: "put-skew", label: "Put skew high", tone: "negative" });
    }
    if (surface.pcr_oi != null && surface.pcr_oi > 1.2) {
      chips.push({ id: "pcr", label: `PCR ${surface.pcr_oi}`, tone: "neutral" });
    }
  }

  if (input.empiricalPopPct != null && input.empiricalSamples >= 8) {
    if (input.empiricalPopPct >= 75) {
      score += 10;
      chips.push({ id: "emp-pop", label: `Empirical OTM ${input.empiricalPopPct}%`, tone: "positive" });
    } else if (input.empiricalPopPct < 60) {
      score -= 8;
      chips.push({ id: "emp-weak", label: `Empirical OTM ${input.empiricalPopPct}%`, tone: "negative" });
    }
  }

  score = clampScore(score);

  let quant_label = "Neutral setup";
  if (score >= 78) quant_label = "Strong sell-vol edge";
  else if (score >= 65) quant_label = "Favorable for premium selling";
  else if (score >= 50) quant_label = "Selective sells only";
  else if (score >= 35) quant_label = "Weak edge — wait";
  else quant_label = "Avoid fresh sells";

  const actions: string[] = [];
  if (!liveIv) actions.push("Confirm with live chain before selling");
  if (vix.sell_size_pct < 100) actions.push(`Size to ${vix.sell_size_pct}% of normal (India VIX)`);
  if (surface?.term_structure === "backwardation") actions.push("Prefer next expiry over nearest weekly");
  if (surface?.skew_25d != null && surface.skew_25d > 4 && optionType === "put")
    actions.push("Widen put wing — skew shows downside fear");
  if (stats.focus.status !== "clean") actions.push(stats.focus.note);
  if (input.empiricalPopPct != null && input.empiricalPopPct < 65)
    actions.push("Historical breach rate high at suggested strike — widen or skip");
  if (!actions.length) actions.push("Standard weekly strangle rules if VIX normal and name is clean");

  return packBundle(score, quant_label, "sell", input, chips, actions.join(" · "), "—");
}

function buildBuyerQuant(input: {
  stats: Pick<OptionStatsBundle, "volatility" | "volatility_regime" | "health" | "focus">;
  volCompare: VolComparison;
  surface: ChainSurfaceMetrics | null;
  vix: IndiaVixRegime;
  empiricalPopPct: number | null;
  empiricalItmPct: number | null;
  empiricalSamples: number;
  empiricalStranglePct: number | null;
  liveIv: boolean;
  optionType: "call" | "put";
  zScore1m?: number;
}): QuantSignalBundle {
  const { stats, volCompare, surface, vix, liveIv, optionType } = input;
  const z = input.zScore1m ?? 0;
  const chips: QuantSignalChip[] = [];
  let score = 50;

  if (liveIv) {
    score += 6;
    chips.push({ id: "live-iv", label: "Live NSE IV", tone: "positive" });
  } else {
    score -= 8;
    chips.push({ id: "hv-proxy", label: "HV proxy only", tone: "negative" });
  }

  const ivRank = stats.volatility.iv_rank;
  const ivHv = stats.volatility.iv_hv_ratio;

  // Buyers want cheap vol
  if (!liveIv) {
    score += 5;
  } else if (ivRank <= 35 && ivHv <= 1) {
    score += 18;
    chips.push({ id: "cheap-vol", label: `Cheap IV rank ${ivRank}%`, tone: "positive" });
  } else if (ivRank <= 50 && ivHv <= 1.05) {
    score += 10;
    chips.push({ id: "fair-vol", label: "Fair IV for buying", tone: "positive" });
  } else if (ivRank >= 65 || ivHv >= 1.15) {
    score -= 16;
    chips.push({ id: "rich-vol", label: `Expensive IV rank ${ivRank}%`, tone: "negative" });
  } else {
    score -= 4;
    chips.push({ id: "mid-vol", label: "IV not cheap", tone: "neutral" });
  }

  if (volCompare.iv_hv_gk_ratio != null) {
    if (volCompare.iv_hv_gk_ratio <= 0.92) {
      score += 12;
      chips.push({ id: "gk-cheap", label: `IV/GK ${volCompare.iv_hv_gk_ratio}× — cheap`, tone: "positive" });
    } else if (volCompare.iv_hv_gk_ratio >= 1.12) {
      score -= 14;
      chips.push({ id: "gk-rich", label: `IV/GK ${volCompare.iv_hv_gk_ratio}× — rich`, tone: "negative" });
    }
  }

  // Trend alignment
  const trend = stats.health.trend_label;
  if (optionType === "call") {
    if (trend === "Bullish") {
      score += 14;
      chips.push({ id: "trend", label: "Bullish — supports calls", tone: "positive" });
    } else if (trend === "Bearish") {
      score -= 16;
      chips.push({ id: "trend", label: "Bearish — avoid calls", tone: "negative" });
    }
    if (z > 1.2) {
      score += 6;
      chips.push({ id: "momentum", label: `+${z.toFixed(1)}σ momentum`, tone: "positive" });
    } else if (z < -1.5) {
      score -= 8;
    }
  } else {
    if (trend === "Bearish") {
      score += 14;
      chips.push({ id: "trend", label: "Bearish — supports puts", tone: "positive" });
    } else if (trend === "Bullish") {
      score -= 16;
      chips.push({ id: "trend", label: "Bullish — avoid puts", tone: "negative" });
    }
    if (z < -1.2) {
      score += 6;
      chips.push({ id: "momentum", label: `${z.toFixed(1)}σ momentum`, tone: "positive" });
    } else if (z > 1.5) {
      score -= 8;
    }
  }

  const regime = stats.volatility_regime;
  if (regime === "Elevated" || regime === "High") {
    score += 6;
    chips.push({ id: "move-potential", label: `${regime} — move potential`, tone: "positive" });
  } else if (regime === "Very Quiet" || regime === "Quiet") {
    score -= 12;
    chips.push({ id: "quiet", label: `${regime} — theta decay risk`, tone: "negative" });
  }

  applyFocusAndVixBuyer(score, chips, stats, vix, (s) => {
    score = s;
  });

  if (surface) {
    if (surface.term_structure === "backwardation") {
      score += 5;
      chips.push({ id: "term-inv", label: "Event vol bid — catalyst", tone: "neutral" });
    }
    if (surface.skew_25d != null && optionType === "put" && surface.skew_25d > 4) {
      score -= 8;
      chips.push({ id: "put-skew", label: "Puts expensive (skew)", tone: "negative" });
    }
    if (surface.skew_25d != null && optionType === "call" && surface.skew_25d > 4) {
      score += 4;
      chips.push({ id: "call-skew", label: "Calls relatively cheap vs puts", tone: "positive" });
    }
    if (surface.pcr_oi != null && surface.pcr_oi > 1.3 && optionType === "call") {
      score += 4;
      chips.push({ id: "pcr", label: "High PCR — contrarian call", tone: "neutral" });
    }
  }

  if (input.empiricalItmPct != null && input.empiricalSamples >= 8) {
    if (input.empiricalItmPct >= 48) {
      score += 10;
      chips.push({ id: "emp-itm", label: `Empirical ITM ${input.empiricalItmPct}%`, tone: "positive" });
    } else if (input.empiricalItmPct < 35) {
      score -= 8;
      chips.push({ id: "emp-weak", label: `Low historical ITM ${input.empiricalItmPct}%`, tone: "negative" });
    }
  }

  score = clampScore(score);

  let quant_label = "Neutral for buying";
  if (score >= 78) quant_label = "Strong directional buy setup";
  else if (score >= 65) quant_label = "Favorable for option buying";
  else if (score >= 50) quant_label = "Selective buys only — defined risk";
  else if (score >= 35) quant_label = "Poor odds — wait for setup";
  else quant_label = "Avoid buying options here";

  const actions: string[] = [];
  if (!liveIv) actions.push("Confirm premium with live chain before buying");
  if (ivRank >= 60 || ivHv >= 1.12) actions.push("IV expensive — prefer spreads over naked long options");
  if (regime === "Very Quiet" || regime === "Quiet")
    actions.push("Low realized vol — time decay hurts long options; need a catalyst");
  if (stats.focus.status !== "clean") actions.push(stats.focus.note);
  if (vix.vix != null && vix.vix >= 20) actions.push("Elevated India VIX — size down; use spreads");
  if (surface?.term_structure === "backwardation") actions.push("Near expiry IV rich — consider next month if holding through event");
  if (optionType === "call" && trend === "Bearish") actions.push("Trend against calls — wait for reversal or buy puts");
  if (optionType === "put" && trend === "Bullish") actions.push("Trend against puts — wait for weakness");
  if (input.empiricalItmPct != null && input.empiricalItmPct < 40)
    actions.push("Strike historically finishes OTM often — go closer ATM or skip");
  if (!actions.length)
    actions.push("Use defined risk (debit spread); size for full premium loss; avoid holding into earnings unless intentional");

  return packBundle(
    score,
    quant_label,
    "buy",
    input,
    chips,
    "—",
    actions.join(" · "),
  );
}

function applyFocusAndVix(
  score: number,
  chips: QuantSignalChip[],
  stats: Pick<OptionStatsBundle, "focus">,
  vix: IndiaVixRegime,
  setScore: (s: number) => void,
) {
  let s = score;
  if (stats.focus.status === "avoid") {
    s -= 25;
    chips.push({ id: "focus-avoid", label: stats.focus.label, tone: "negative" });
  } else if (stats.focus.status === "caution") {
    s -= 10;
    chips.push({ id: "focus-caution", label: "Event caution", tone: "neutral" });
  } else {
    s += 5;
  }
  if (vix.regime === "elevated" || vix.regime === "high") {
    s -= vix.regime === "high" ? 15 : 8;
    chips.push({ id: "vix", label: vix.label, tone: "negative" });
  } else if (vix.regime === "low" || vix.regime === "normal") {
    s += 4;
  }
  setScore(s);
}

function applyFocusAndVixBuyer(
  score: number,
  chips: QuantSignalChip[],
  stats: Pick<OptionStatsBundle, "focus">,
  vix: IndiaVixRegime,
  setScore: (s: number) => void,
) {
  let s = score;
  if (stats.focus.status === "avoid") {
    s -= 22;
    chips.push({ id: "focus-avoid", label: stats.focus.label, tone: "negative" });
  } else if (stats.focus.status === "caution") {
    s -= 8;
    chips.push({ id: "focus-caution", label: "Event caution", tone: "neutral" });
  }
  if (vix.regime === "low") {
    s += 5;
    chips.push({ id: "vix-low", label: "Low VIX — cheaper options", tone: "positive" });
  } else if (vix.regime === "high") {
    s -= 10;
    chips.push({ id: "vix-high", label: "High VIX — expensive premium", tone: "negative" });
  }
  setScore(s);
}

function packBundle(
  score: number,
  quant_label: string,
  mode: QuantMode,
  input: {
    volCompare: VolComparison;
    surface: ChainSurfaceMetrics | null;
    vix: IndiaVixRegime;
    empiricalPopPct: number | null;
    empiricalItmPct: number | null;
    empiricalSamples: number;
    empiricalStranglePct: number | null;
    liveIv: boolean;
  },
  chips: QuantSignalChip[],
  seller_action: string,
  buyer_action: string,
): QuantSignalBundle {
  return {
    quant_score: score,
    quant_label,
    quant_mode: mode,
    live_iv: input.liveIv,
    hv_gk_pct: Math.round(input.volCompare.hv_gk * 1000) / 10,
    iv_hv_gk_ratio: input.volCompare.iv_hv_gk_ratio,
    empirical_pop_pct: input.empiricalPopPct,
    empirical_itm_pct: input.empiricalItmPct,
    empirical_samples: input.empiricalSamples,
    empirical_strangle_survival_pct: input.empiricalStranglePct,
    india_vix: input.vix.vix,
    vix_regime: input.vix.label,
    sell_size_pct: input.vix.sell_size_pct,
    buy_size_pct: input.vix.regime === "high" ? 50 : input.vix.regime === "elevated" ? 75 : 100,
    pcr_oi: input.surface?.pcr_oi ?? null,
    skew_25d: input.surface?.skew_25d ?? null,
    skew_label: input.surface?.skew_label ?? "—",
    term_structure: input.surface?.term_structure ?? null,
    max_pain: input.surface?.max_pain ?? null,
    max_pain_dist_pct: input.surface?.max_pain_dist_pct ?? null,
    chips,
    seller_action,
    buyer_action,
  };
}
