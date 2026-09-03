import type { ChainSurfaceMetrics } from "./chain-analytics";
import type { IndiaVixRegime } from "./india-vix";
import type { VolComparison } from "./vol-metrics";
import type { OptionStatsBundle } from "./option-stats";

export interface QuantSignalChip {
  id: string;
  label: string;
  tone: "positive" | "negative" | "neutral";
}

export interface QuantSignalBundle {
  quant_score: number;
  quant_label: string;
  live_iv: boolean;
  hv_gk_pct: number;
  iv_hv_gk_ratio: number | null;
  empirical_pop_pct: number | null;
  empirical_samples: number;
  empirical_strangle_survival_pct: number | null;
  india_vix: number | null;
  vix_regime: string;
  sell_size_pct: number;
  pcr_oi: number | null;
  skew_25d: number | null;
  skew_label: string;
  term_structure: string | null;
  max_pain: number | null;
  max_pain_dist_pct: number | null;
  chips: QuantSignalChip[];
  seller_action: string;
}

export function buildQuantSignals(input: {
  stats: Pick<OptionStatsBundle, "volatility" | "volatility_regime" | "health" | "focus">;
  volCompare: VolComparison;
  surface: ChainSurfaceMetrics | null;
  vix: IndiaVixRegime;
  empiricalPopPct: number | null;
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

  if (stats.focus.status === "avoid") {
    score -= 25;
    chips.push({ id: "focus-avoid", label: stats.focus.label, tone: "negative" });
  } else if (stats.focus.status === "caution") {
    score -= 10;
    chips.push({ id: "focus-caution", label: "Event caution", tone: "neutral" });
  } else {
    score += 5;
  }

  if (vix.regime === "elevated" || vix.regime === "high") {
    score -= vix.regime === "high" ? 15 : 8;
    chips.push({ id: "vix", label: vix.label, tone: "negative" });
  } else if (vix.regime === "low" || vix.regime === "normal") {
    score += 4;
  }

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

  score = Math.round(Math.min(100, Math.max(0, score)));

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

  return {
    quant_score: score,
    quant_label,
    live_iv: liveIv,
    hv_gk_pct: Math.round(volCompare.hv_gk * 1000) / 10,
    iv_hv_gk_ratio: volCompare.iv_hv_gk_ratio,
    empirical_pop_pct: input.empiricalPopPct,
    empirical_samples: input.empiricalSamples,
    empirical_strangle_survival_pct: input.empiricalStranglePct,
    india_vix: vix.vix,
    vix_regime: vix.label,
    sell_size_pct: vix.sell_size_pct,
    pcr_oi: surface?.pcr_oi ?? null,
    skew_25d: surface?.skew_25d ?? null,
    skew_label: surface?.skew_label ?? "—",
    term_structure: surface?.term_structure ?? null,
    max_pain: surface?.max_pain ?? null,
    max_pain_dist_pct: surface?.max_pain_dist_pct ?? null,
    chips,
    seller_action: actions.join(" · "),
  };
}
