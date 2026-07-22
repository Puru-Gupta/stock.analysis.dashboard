import type { OHLCVBar } from "@/lib/data/types";
import { computeAtr } from "./technical";
import { probAbove, historicalVol, normalizeIv } from "./options";
import {
  clamp01,
  distributionConfidence,
  empiricalPercentile,
  mean,
  normCdf,
  r1,
  r2,
  starsFromScore,
  stdDev,
  zSignal,
} from "./stats";

const TIMEFRAMES = [
  { key: "1w", label: "1 Week", days: 5 },
  { key: "2w", label: "2 Weeks", days: 10 },
  { key: "3w", label: "3 Weeks", days: 15 },
  { key: "1m", label: "1 Month", days: 22 },
  { key: "3m", label: "3 Months", days: 63 },
  { key: "6m", label: "6 Months", days: 126 },
  { key: "1y", label: "1 Year", days: 252 },
] as const;

export type VolRegime = "Very Quiet" | "Quiet" | "Normal" | "Elevated" | "High" | "Extreme";
export type ZSignal = ReturnType<typeof zSignal>;
export type StrikeRating = "Excellent" | "Good" | "Caution" | "Risk";

export interface TimeframeDistribution {
  key: string;
  label: string;
  days: number;
  mean: number;
  std_dev: number;
  current: number;
  z_score: number;
  percentile: number;
  prob_beyond_pct: number;
  direction: "above" | "below" | "at";
  range_68: [number, number];
  range_95: [number, number];
  range_997: [number, number];
  signal: ZSignal;
  sample_size: number;
}

export interface ExpectedMoveBands {
  sigma_1: [number, number];
  sigma_2: [number, number];
  sigma_3: [number, number];
  spot: number;
  window_label: string;
}

export interface StrikeProbability {
  strike: number;
  type: "CE" | "PE";
  premium: number;
  dist_from_mean: number;
  dist_sigma: number;
  prob_otm: number;
  prob_itm: number;
  prob_touch: number;
  rating: StrikeRating;
  rating_color: "green" | "yellow" | "red";
}

export interface VolatilityDashboard {
  hv_20: number;
  hv_60: number;
  hv_120: number;
  implied_vol: number;
  iv_hv_ratio: number;
  iv_rank: number;
  iv_percentile: number;
  iv_trend: "rising" | "falling" | "stable";
  iv_trend_label: string;
  seller_favorability: number;
  seller_label: string;
  seller_stars: string;
  seller_notes: string[];
  iv_above_hv: boolean;
}

export interface MeanReversionMeter {
  z_score: number;
  dist_from_mean: number;
  window_label: string;
  probability: "High" | "Medium" | "Low";
  stars: string;
  direction: "above" | "below" | "neutral";
}

export interface StatisticalHealth {
  trend: string;
  trend_label: "Bullish" | "Bearish" | "Sideways";
  current_percentile: number;
  historical_percentile: number;
  distribution_position: string;
  std_dev: number;
  volatility_regime: VolRegime;
  confidence_score: number;
  confidence_label: string;
  probability_rating: StrikeRating;
}

export interface SellerRecommendation {
  action: string;
  suggested_strike: number;
  option_type: "CE" | "PE";
  prob_otm: number;
  prob_touch: number;
  risk: "Low" | "Medium" | "High";
  confidence: number;
  reasons: string[];
}

export interface SmartAlert {
  id: string;
  type: "warning" | "opportunity" | "info";
  title: string;
  detail: string;
}

export interface OptionStatsBundle {
  distributions: TimeframeDistribution[];
  comparison: Pick<TimeframeDistribution, "label" | "z_score" | "percentile" | "signal">[];
  expected_move: ExpectedMoveBands;
  strike_probabilities: StrikeProbability[];
  volatility: VolatilityDashboard;
  volatility_regime: VolRegime;
  regime_color: "green" | "yellow" | "red";
  confidence: ReturnType<typeof distributionConfidence>;
  mean_reversion: MeanReversionMeter;
  health: StatisticalHealth;
  recommendation: SellerRecommendation;
  alerts: SmartAlert[];
}

function ivRankFromHvSeries(bars: OHLCVBar[], currentIv: number) {
  const samples: number[] = [];
  for (let end = 40; end <= bars.length; end += 3) {
    samples.push(historicalVol(bars.slice(0, end)));
  }
  if (samples.length < 10) return { rank: 50, percentile: 50 };
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const rank = max > min ? clamp01((currentIv - min) / (max - min)) * 100 : 50;
  const percentile = (samples.filter((s) => s < currentIv).length / samples.length) * 100;
  return { rank: Math.round(rank), percentile: Math.round(percentile) };
}

function computeDistribution(bars: OHLCVBar[], window: number, label: string, key: string): TimeframeDistribution | null {
  const closes = bars.map((b) => b.close);
  if (closes.length < Math.min(window, 10)) return null;
  const slice = closes.slice(-window);
  const m = mean(slice);
  const s = stdDev(slice) || m * 0.005;
  const current = closes.at(-1)!;
  const z = s > 0 ? (current - m) / s : 0;
  const percentile = r1(normCdf(z) * 100);
  const direction = z > 0.05 ? "above" : z < -0.05 ? "below" : "at";
  const probBeyond = direction === "above" ? r1(100 - percentile) : direction === "below" ? percentile : 50;

  return {
    key,
    label,
    days: window,
    mean: r2(m),
    std_dev: r2(s),
    current: r2(current),
    z_score: r1(z),
    percentile,
    prob_beyond_pct: probBeyond,
    direction,
    range_68: [r2(m - s), r2(m + s)],
    range_95: [r2(m - 2 * s), r2(m + 2 * s)],
    range_997: [r2(m - 3 * s), r2(m + 3 * s)],
    signal: zSignal(z),
    sample_size: slice.length,
  };
}

function dailyReturns(bars: OHLCVBar[]) {
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    rets.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
  }
  return rets;
}

function percentileInSeries(value: number, series: number[]) {
  if (!series.length) return 50;
  return Math.round((series.filter((v) => v <= value).length / series.length) * 100);
}

function detectVolRegime(input: {
  hv: number;
  ivPct: number;
  atrPct: number;
  rangePct: number;
  stdExpansion: number;
}): VolRegime {
  const composite =
    0.3 * input.hv * 100 +
    0.25 * input.ivPct +
    0.2 * input.atrPct +
    0.15 * input.rangePct +
    0.1 * input.stdExpansion;

  if (composite >= 75) return "Extreme";
  if (composite >= 62) return "High";
  if (composite >= 52) return "Elevated";
  if (composite >= 42) return "Normal";
  if (composite >= 30) return "Quiet";
  return "Very Quiet";
}

function regimeColor(regime: VolRegime): "green" | "yellow" | "red" {
  if (regime === "Very Quiet" || regime === "Quiet" || regime === "Normal") return "green";
  if (regime === "Elevated") return "yellow";
  return "red";
}

function probTouch(spot: number, strike: number, vol: number, dte: number, type: "call" | "put") {
  const pAbove = probAbove(spot, strike, vol, dte);
  const pItm = type === "call" ? pAbove : 100 - pAbove;
  const otm = type === "call" ? strike > spot : strike < spot;
  if (otm) return r1(Math.min(99, pItm * 2));
  return r1(Math.max(pItm, 85));
}

function strikeRating(probOtm: number, distSigma: number): { rating: StrikeRating; color: "green" | "yellow" | "red" } {
  if (probOtm >= 90 && distSigma >= 1.5) return { rating: "Excellent", color: "green" };
  if (probOtm >= 82 && distSigma >= 1) return { rating: "Good", color: "green" };
  if (probOtm >= 70) return { rating: "Caution", color: "yellow" };
  return { rating: "Risk", color: "red" };
}

function trendLabel(trend: string): StatisticalHealth["trend_label"] {
  if (trend === "uptrend") return "Bullish";
  if (trend === "downtrend") return "Bearish";
  return "Sideways";
}

function buildAlerts(ctx: {
  z1m: number;
  ivRank: number;
  ivHv: number;
  regime: VolRegime;
  meanRev: MeanReversionMeter;
  bestStrike?: StrikeProbability;
  hvChange7: number;
}): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  if (Math.abs(ctx.z1m) >= 3) {
    alerts.push({ id: "3sigma", type: "warning", title: "Stock outside 3σ", detail: `Price is ${ctx.z1m.toFixed(1)}σ from the 1-month mean — statistically extreme.` });
  } else if (Math.abs(ctx.z1m) >= 2) {
    alerts.push({ id: "2sigma", type: "warning", title: "Stock outside 2σ", detail: `Price is ${ctx.z1m.toFixed(1)}σ from the 1-month mean — elevated move.` });
  }
  if (ctx.ivRank >= 70) alerts.push({ id: "iv-rank", type: "opportunity", title: "High IV Rank", detail: `IV rank ${ctx.ivRank}% — premiums are rich vs the last year.` });
  if (ctx.ivHv >= 1.15) alerts.push({ id: "premium-rich", type: "opportunity", title: "Premium Rich", detail: "IV is above historical vol — favorable for option sellers." });
  if (ctx.ivHv <= 0.85) alerts.push({ id: "premium-cheap", type: "info", title: "Premium Cheap", detail: "IV below HV — selling may not be well compensated." });
  if (ctx.hvChange7 > 3) alerts.push({ id: "vol-expansion", type: "warning", title: "Volatility Expansion", detail: "HV jumped this week — widen strikes or reduce size." });
  if (ctx.hvChange7 < -2) alerts.push({ id: "iv-crush", type: "info", title: "Volatility Contraction", detail: "Realized vol falling — watch for IV crush after events." });
  if (ctx.meanRev.probability === "High") {
    alerts.push({ id: "mean-rev", type: "opportunity", title: "Mean Reversion Opportunity", detail: `Price ${ctx.meanRev.z_score > 0 ? "above" : "below"} mean by ${Math.abs(ctx.meanRev.z_score).toFixed(1)}σ.` });
  }
  if (ctx.regime === "Very Quiet" || ctx.regime === "Quiet") {
    alerts.push({ id: "quiet-regime", type: "opportunity", title: "Quiet Volatility Regime", detail: "Range-bound conditions favor defined-risk premium selling." });
  }
  if (ctx.bestStrike?.rating === "Excellent") {
    alerts.push({
      id: "best-sell",
      type: "opportunity",
      title: "Best Option Selling Opportunity Today",
      detail: `${ctx.bestStrike.strike} ${ctx.bestStrike.type} — ${ctx.bestStrike.prob_otm}% OTM, ${ctx.bestStrike.dist_sigma}σ away.`,
    });
  }
  return alerts.slice(0, 8);
}

function buildRecommendation(input: {
  optionType: "call" | "put";
  strikes: StrikeProbability[];
  z1m: number;
  ivRank: number;
  ivHv: number;
  regime: VolRegime;
  confidence: number;
}): SellerRecommendation {
  const type = input.optionType === "put" ? "PE" : "CE";
  const action = input.optionType === "put" ? "SELL PE" : "SELL CE";
  const candidates = input.strikes
    .filter((s) => s.type === type)
    .sort((a, b) => {
      const scoreA = a.prob_otm * 0.5 + a.dist_sigma * 15 + (a.rating === "Excellent" ? 20 : a.rating === "Good" ? 10 : 0);
      const scoreB = b.prob_otm * 0.5 + b.dist_sigma * 15 + (b.rating === "Excellent" ? 20 : b.rating === "Good" ? 10 : 0);
      return scoreB - scoreA;
    });

  const best = candidates[0];
  if (!best) {
    return {
      action: "WAIT",
      suggested_strike: 0,
      option_type: type,
      prob_otm: 0,
      prob_touch: 0,
      risk: "High",
      confidence: 0,
      reasons: ["Insufficient strike data — load live option chain."],
    };
  }

  const reasons: string[] = [];
  if (Math.abs(input.z1m) >= 1.5) reasons.push(`Price near ${input.z1m > 0 ? "+" : ""}${input.z1m.toFixed(1)}σ`);
  if (input.ivHv >= 1.05) reasons.push("IV higher than HV");
  if (input.ivRank >= 55) reasons.push(`High IV Rank (${input.ivRank}%)`);
  if (input.regime === "Quiet" || input.regime === "Very Quiet" || input.regime === "Normal") {
    reasons.push(`${input.regime} volatility regime`);
  }
  reasons.push(`Historical probability favors expiry OTM (${best.prob_otm}%)`);

  let confidence = 50;
  confidence += clamp01((best.prob_otm - 70) / 25) * 20;
  confidence += clamp01(input.ivRank / 100) * 15;
  confidence += input.ivHv >= 1.1 ? 10 : input.ivHv >= 1 ? 5 : 0;
  confidence += clamp01(input.confidence / 100) * 15;
  confidence -= best.prob_touch > 40 ? 10 : 0;
  confidence = Math.round(Math.min(95, Math.max(20, confidence)));

  const risk: SellerRecommendation["risk"] =
    best.prob_otm >= 88 && best.dist_sigma >= 1.5 && best.prob_touch <= 35
      ? "Low"
      : best.prob_otm >= 75
        ? "Medium"
        : "High";

  return {
    action,
    suggested_strike: best.strike,
    option_type: type,
    prob_otm: best.prob_otm,
    prob_touch: best.prob_touch,
    risk,
    confidence,
    reasons,
  };
}

export function computeOptionStats(input: {
  bars: OHLCVBar[];
  spot: number;
  daysToExpiry: number;
  atmIv: number;
  trend: string;
  optionType: "call" | "put";
  legs: { strike: number; ltp: number; iv?: number; type: string }[];
}): OptionStatsBundle {
  const { bars, spot, daysToExpiry, atmIv, trend, optionType } = input;
  const hv20 = historicalVol(bars, 20);
  const hv60 = bars.length >= 65 ? historicalVol(bars, 60) : hv20;
  const hv120 = bars.length >= 125 ? historicalVol(bars, 120) : hv60;
  const iv = normalizeIv(atmIv, hv20);
  const { rank: ivRank, percentile: ivPct } = ivRankFromHvSeries(bars, iv);

  const distributions = TIMEFRAMES.map((tf) => computeDistribution(bars, tf.days, tf.label, tf.key)).filter(
    (d): d is TimeframeDistribution => d != null,
  );

  const comparison = distributions.map(({ label, z_score, percentile, signal }) => ({
    label,
    z_score,
    percentile,
    signal,
  }));

  const primary =
    distributions.find((d) => d.key === "1m") ||
    distributions.find((d) => d.key === "3w") ||
    distributions[distributions.length - 1];
  const emWindow = primary || { mean: spot, std_dev: spot * hv20 * Math.sqrt(daysToExpiry / 252), label: "1 Month" };
  const expected_move: ExpectedMoveBands = {
    spot: r2(spot),
    window_label: primary?.label || "1 Month",
    sigma_1: [r2(emWindow.mean - emWindow.std_dev), r2(emWindow.mean + emWindow.std_dev)],
    sigma_2: [r2(emWindow.mean - 2 * emWindow.std_dev), r2(emWindow.mean + 2 * emWindow.std_dev)],
    sigma_3: [r2(emWindow.mean - 3 * emWindow.std_dev), r2(emWindow.mean + 3 * emWindow.std_dev)],
  };

  const rets = dailyReturns(bars);
  const confidence = distributionConfidence(rets.slice(-252));

  const atr = computeAtr(bars);
  const atrSeries: number[] = [];
  for (let end = 20; end <= bars.length; end += 5) {
    atrSeries.push(computeAtr(bars.slice(0, end)));
  }
  const atrPct = percentileInSeries(atr, atrSeries);
  const dailyRanges = bars.slice(-60).map((b) => ((b.high - b.low) / b.close) * 100);
  const todayRange = bars.length ? ((bars.at(-1)!.high - bars.at(-1)!.low) / spot) * 100 : 0;
  const rangePct = percentileInSeries(todayRange, dailyRanges);
  const hvSeries: number[] = [];
  for (let end = 30; end <= bars.length; end += 5) hvSeries.push(historicalVol(bars.slice(0, end)));
  const hvPct = percentileInSeries(hv20, hvSeries);
  const stdNow = primary?.std_dev || 1;
  const stdPast = distributions.find((d) => d.key === "3m")?.std_dev || stdNow;
  const stdExpansion = stdPast > 0 ? clamp01((stdNow / stdPast - 0.8) / 0.6) * 100 : 50;
  const volatility_regime = detectVolRegime({ hv: hv20, ivPct, atrPct, rangePct, stdExpansion });

  const hv7 = bars.length > 26 ? historicalVol(bars.slice(0, -5)) : hv20;
  const hvChg7 = r1((hv20 - hv7) * 100);
  const ivTrend = hvChg7 > 2 ? "rising" : hvChg7 < -2 ? "falling" : ("stable" as const);
  const ivTrendLabel =
    ivTrend === "rising" ? "Vol expanding" : ivTrend === "falling" ? "Vol contracting" : "Vol stable";

  const sellerFavor =
    (iv >= hv20 ? 35 : 10) + clamp01(ivRank / 100) * 35 + clamp01((iv / hv20 - 0.9) / 0.4) * 30;
  const sellerStars = starsFromScore(sellerFavor);
  const ivHvRatio = hv20 > 0 ? iv / hv20 : 1;

  const sellerNotes: string[] = [];
  if (iv >= hv20 && ivHvRatio < 1.1) sellerNotes.push("IV is only slightly above HV — modest premium edge");
  if (ivRank < 40) sellerNotes.push(`IV rank ${ivRank}% is low vs the past year — premiums not historically rich`);
  if (ivTrend === "falling") sellerNotes.push("Vol is contracting — option prices may compress further");
  if (Math.abs(primary?.z_score ?? 0) >= 1.5) {
    const z = primary!.z_score;
    sellerNotes.push(`Price is ${z > 0 ? "+" : ""}${z}σ from mean — elevated directional risk for CE sellers`);
  }

  const sellerLabel =
    sellerFavor >= 75
      ? "GOOD FOR OPTION SELLERS"
      : sellerFavor >= 55
        ? "Favorable for sellers"
        : sellerFavor >= 40
          ? "Mild seller edge — pick strikes carefully"
          : iv >= hv20
            ? "IV above HV only — weak overall seller setup"
            : "Caution for sellers";

  const volatility: VolatilityDashboard = {
    hv_20: r1(hv20 * 100),
    hv_60: r1(hv60 * 100),
    hv_120: r1(hv120 * 100),
    implied_vol: r1(iv * 100),
    iv_hv_ratio: r1(ivHvRatio),
    iv_rank: ivRank,
    iv_percentile: ivPct,
    iv_trend: ivTrend,
    iv_trend_label: ivTrendLabel,
    seller_favorability: Math.round(sellerFavor),
    seller_label: sellerLabel,
    seller_stars: sellerStars,
    seller_notes: sellerNotes,
    iv_above_hv: iv >= hv20,
  };

  const z1m = primary?.z_score ?? 0;
  const meanDist = primary ? r2(spot - primary.mean) : 0;
  const absZ = Math.abs(z1m);
  const meanRevProb: MeanReversionMeter["probability"] =
    absZ >= 2 ? "High" : absZ >= 1.2 ? "Medium" : "Low";
  const mean_reversion: MeanReversionMeter = {
    z_score: z1m,
    dist_from_mean: meanDist,
    window_label: primary?.label || "1 Month",
    probability: meanRevProb,
    stars: starsFromScore(absZ >= 2 ? 85 : absZ >= 1.2 ? 65 : 35),
    direction: z1m > 0.3 ? "above" : z1m < -0.3 ? "below" : "neutral",
  };

  const chainLegs = input.legs.filter((l) => l.ltp > 0).slice(0, 50);

  const strike_probabilities: StrikeProbability[] = chainLegs.map((leg) => {
    const type = leg.type === "PE" ? "PE" : "CE";
    const opt = type === "PE" ? "put" : "call";
    const vol = normalizeIv(leg.iv, hv20);
    const pAbove = probAbove(spot, leg.strike, vol, daysToExpiry);
    const probItm = opt === "call" ? pAbove : 100 - pAbove;
    const probOtm = r1(100 - probItm);
    const distFromMean = primary ? r2(leg.strike - primary.mean) : r2(leg.strike - spot);
    const distSigma = primary && primary.std_dev > 0 ? r1(Math.abs(leg.strike - primary.mean) / primary.std_dev) : 0;
    const touch = probTouch(spot, leg.strike, vol, daysToExpiry, opt);
    const { rating, color } = strikeRating(probOtm, distSigma);
    return {
      strike: leg.strike,
      type,
      premium: leg.ltp,
      dist_from_mean: distFromMean,
      dist_sigma: distSigma,
      prob_otm: probOtm,
      prob_itm: probItm,
      prob_touch: touch,
      rating,
      rating_color: color,
    };
  });

  const filteredStrikes = strike_probabilities.filter((s) => s.type === (optionType === "put" ? "PE" : "CE"));
  const bestStrike = [...filteredStrikes].sort((a, b) => b.prob_otm - a.prob_otm + b.dist_sigma - a.dist_sigma)[0];

  const histPct = empiricalPercentile(spot, bars.slice(-252).map((b) => b.close));
  const health: StatisticalHealth = {
    trend,
    trend_label: trendLabel(trend),
    current_percentile: primary?.percentile ?? 50,
    historical_percentile: histPct,
    distribution_position:
      Math.abs(z1m) >= 2 ? "Extreme tail" : Math.abs(z1m) >= 1 ? "Extended" : "Core range",
    std_dev: primary?.std_dev ?? 0,
    volatility_regime,
    confidence_score: confidence.score,
    confidence_label: confidence.label,
    probability_rating: bestStrike?.rating ?? "Caution",
  };

  const recommendation = buildRecommendation({
    optionType,
    strikes: filteredStrikes.length ? filteredStrikes : strike_probabilities,
    z1m,
    ivRank,
    ivHv: volatility.iv_hv_ratio,
    regime: volatility_regime,
    confidence: confidence.score,
  });

  const alerts = buildAlerts({
    z1m,
    ivRank,
    ivHv: volatility.iv_hv_ratio,
    regime: volatility_regime,
    meanRev: mean_reversion,
    bestStrike,
    hvChange7: hvChg7,
  });

  return {
    distributions,
    comparison,
    expected_move,
    strike_probabilities: filteredStrikes.length ? filteredStrikes : strike_probabilities,
    volatility,
    volatility_regime,
    regime_color: regimeColor(volatility_regime),
    confidence,
    mean_reversion,
    health,
    recommendation,
    alerts,
  };
}
