import { fetchLiveMarketBundle } from "@/lib/data/agents/orchestrator";
import { INDIAN_INDICES, type IndianIndexDef } from "@/lib/data/indian-indices";
import { analyzeChainSurface, quickChainIv } from "./chain-analytics";
import { pickBestOptionStrategy } from "./option-strategy-pick";
import { historicalVol } from "./options";
import { computeTechnicalScores, detectTrend, computeRsi } from "./technical";
import { evaluateIndexRegime } from "./regime";
import { getIndiaVixRegime } from "./india-vix";
import { analyzeIndexSentiment, type SentimentBias } from "./index-sentiment";
import { computeOptionStats } from "./option-stats";

export type IndexForecastBias = "bullish" | "bearish" | "sideways";

export interface IndexForecastRow {
  id: string;
  label: string;
  symbol: string;
  spot: number;
  change_pct: number | null;
  daily_forecast: IndexForecastBias;
  weekly_forecast: IndexForecastBias;
  confidence: number;
  composite_score: number;
  technical_score: number;
  technical_trend: string;
  rsi: number;
  sentiment_score: number;
  sentiment_bias: SentimentBias;
  sentiment_label: string;
  regime_label: string;
  regime_state: string;
  vix_label: string;
  india_vix: number | null;
  pcr_oi: number | null;
  skew_25d: number | null;
  max_pain: number | null;
  iv_rank_proxy: number;
  recommended_strategy: string;
  strategy_note: string;
  strategy_side: "put" | "call" | "both" | "na";
  option_play: string;
  drivers: string[];
  risks: string[];
  sentiment_headlines: { title: string; bias: string; channel: string }[];
}

export interface IndexForecastBundle {
  indices: IndexForecastRow[];
  market_summary: {
    daily_bias: IndexForecastBias;
    label: string;
    detail: string;
  };
  analyzed_at: string;
}

function biasFromScore(score: number, wide = false): IndexForecastBias {
  const up = wide ? 55 : 58;
  const down = wide ? 45 : 42;
  if (score >= up) return "bullish";
  if (score <= down) return "bearish";
  return "sideways";
}

function regimeToScore(state: string): number {
  if (state === "risk_on") return 72;
  if (state === "risk_off") return 28;
  return 50;
}

function vixToScore(regime: string): number {
  if (regime === "low") return 58;
  if (regime === "normal") return 52;
  if (regime === "elevated") return 45;
  if (regime === "high") return 35;
  return 50;
}

function pcrToScore(pcr: number | null): number {
  if (pcr == null) return 50;
  if (pcr > 1.25) return 58;
  if (pcr > 1.05) return 54;
  if (pcr < 0.75) return 42;
  if (pcr < 0.9) return 46;
  return 50;
}

function optionPlayForBias(
  bias: IndexForecastBias,
  strategy: string,
  vixHigh: boolean,
): string {
  if (strategy === "Wait") return "No fresh index premium — wait for cleaner setup.";
  if (bias === "sideways") {
    if (strategy.includes("Condor") || strategy.includes("Strangle")) {
      return vixHigh ? "Range expected — iron condor with wider wings; size down." : "Range book — short strangle/condor inside expected move.";
    }
    return "Sideways tape — prefer defined-risk credit spreads over naked legs.";
  }
  if (bias === "bullish") {
    return strategy.includes("Put")
      ? "Bullish bias — sell OTM puts / bull put spreads; avoid naked calls."
      : "Bullish but use put-side structures or call spreads only.";
  }
  return strategy.includes("Call")
    ? "Bearish bias — sell OTM calls / bear call spreads; avoid naked puts."
    : "Bearish — call-side credit spreads; hedge tail on put shorts.";
}

async function forecastOneIndex(
  index: IndianIndexDef,
  vixRegime: Awaited<ReturnType<typeof getIndiaVixRegime>>,
  sentiment: Awaited<ReturnType<typeof analyzeIndexSentiment>>,
): Promise<IndexForecastRow | null> {
  try {
    const live = await fetchLiveMarketBundle(index.yahoo, {
      days: 365,
      includeOptions: true,
    });
    const bars = live.bars;
    if (bars.length < 40) return null;

    const spot = live.quote || bars.at(-1)?.close || 0;
    if (!spot) return null;

    const change_pct =
      live.quotes.find((q) => q.change_pct != null)?.change_pct ??
      (bars.length > 1
        ? Math.round(((spot - bars.at(-2)!.close) / bars.at(-2)!.close) * 1000) / 10
        : null);

    const technical = computeTechnicalScores(bars, bars);
    const regime = evaluateIndexRegime(bars);
    const trend = detectTrend(bars);
    const rsi = Math.round(computeRsi(bars));

    const chain = live.option_chain?.ok ? live.option_chain : undefined;
    const legs = chain?.legs ?? [];
    const hv = historicalVol(bars);
    const q = legs.length ? quickChainIv(legs, chain?.expiries ?? [], spot, hv) : null;
    const atmIv = q?.atmIv ?? hv;
    const ivIsProxy = q?.ivIsProxy ?? true;
    const dte = q?.dte ?? 7;

    const surface = legs.length ? analyzeChainSurface(legs, spot, chain?.expiries ?? [], hv) : null;

    const stats = computeOptionStats({
      bars,
      spot,
      daysToExpiry: dte,
      atmIv,
      trend,
      optionType: "put",
      legs: legs.map((l) => ({
        strike: l.strike,
        ltp: l.ltp,
        iv: l.iv,
        type: l.type,
        expiry: l.expiry,
      })),
      ivIsProxy,
      strategyMode: "neutral",
    });

    const z1m = stats.distributions.find((d) => d.key === "1m")?.z_score ?? 0;
    const strategyPick = pickBestOptionStrategy({
      optionType: "put",
      regime: stats.volatility_regime,
      trendLabel: stats.health.trend_label,
      z1m,
      ivRank: stats.volatility.iv_rank,
      ivHvRatio: stats.volatility.iv_hv_ratio,
      focusStatus: "clean",
      sellerVolScore: stats.volatility.seller_favorability,
      quantScore: 65,
      empiricalPop: null,
      liveIv: !ivIsProxy,
    });

    const techScore = technical.technical_score;
    const sentScore = sentiment.score;
    const regScore = regimeToScore(regime.state);
    const vixScore = vixToScore(vixRegime.regime);
    const pcrScore = pcrToScore(surface?.pcr_oi ?? null);

    const dailyComposite = Math.round(
      techScore * 0.32 +
        sentScore * 0.28 +
        regScore * 0.18 +
        vixScore * 0.12 +
        pcrScore * 0.1,
    );

    const weeklyComposite = Math.round(
      dailyComposite * 0.45 +
        (regime.ret_20d > 3 ? 65 : regime.ret_20d < -3 ? 35 : 50) * 0.25 +
        (trend === "uptrend" ? 68 : trend === "downtrend" ? 32 : 50) * 0.3,
    );

    const daily_forecast = biasFromScore(dailyComposite);
    const weekly_forecast = biasFromScore(weeklyComposite, true);

    const spread = Math.abs(dailyComposite - 50);
    const confidence = Math.min(92, Math.round(48 + spread * 0.85));

    const drivers: string[] = [];
    if (technical.trend === "uptrend") drivers.push(`Technicals: uptrend (score ${techScore})`);
    else if (technical.trend === "downtrend") drivers.push(`Technicals: downtrend (score ${techScore})`);
    else drivers.push(`Technicals: range-bound (RSI ${rsi}, score ${techScore})`);
    drivers.push(sentiment.label);
    drivers.push(regime.detail);
    if (surface?.pcr_oi != null) drivers.push(`PCR(OI) ${surface.pcr_oi} · skew ${surface.skew_25d ?? "—"}pp`);
    if (vixRegime.vix != null) drivers.push(`India VIX ${vixRegime.vix.toFixed(1)} — ${vixRegime.label}`);

    const risks: string[] = [];
    if (Math.abs(z1m) >= 1.5) risks.push(`Price stretched ${z1m > 0 ? "+" : ""}${z1m.toFixed(1)}σ — gap risk on index weekly`);
    if (vixRegime.regime === "high" || vixRegime.regime === "elevated") risks.push("Elevated VIX — widen wings / reduce lot size");
    if (sentiment.bear_count >= 3 && daily_forecast === "bullish") risks.push("Headline bearish cluster — sentiment vs technicals diverge");
    if (sentiment.bull_count >= 3 && daily_forecast === "bearish") risks.push("Positive headline cluster — mean-reversion risk");
    if (ivIsProxy) risks.push("Live index IV unavailable — confirm premiums on broker terminal");
    if (!risks.length) risks.push("Standard weekly event risk — check RBI/global calendar");

    const vixHigh = vixRegime.regime === "high" || vixRegime.regime === "elevated";

    return {
      id: index.id,
      label: index.label,
      symbol: index.yahoo,
      spot: Math.round(spot * 100) / 100,
      change_pct,
      daily_forecast,
      weekly_forecast,
      confidence,
      composite_score: dailyComposite,
      technical_score: techScore,
      technical_trend: technical.trend,
      rsi,
      sentiment_score: sentScore,
      sentiment_bias: sentiment.bias,
      sentiment_label: sentiment.label,
      regime_label: regime.label,
      regime_state: regime.state,
      vix_label: vixRegime.label,
      india_vix: vixRegime.vix,
      pcr_oi: surface?.pcr_oi ?? null,
      skew_25d: surface?.skew_25d ?? null,
      max_pain: surface?.max_pain ?? null,
      iv_rank_proxy: stats.volatility.iv_rank,
      recommended_strategy: strategyPick.recommended_strategy,
      strategy_note: strategyPick.strategy_note,
      strategy_side: strategyPick.strategy_side,
      option_play: optionPlayForBias(daily_forecast, strategyPick.recommended_strategy, vixHigh),
      drivers,
      risks,
      sentiment_headlines: sentiment.headlines.slice(0, 5).map((h) => ({
        title: h.title,
        bias: h.bias,
        channel: h.channel,
      })),
    };
  } catch {
    return null;
  }
}

export async function buildIndexForecastBundle(): Promise<IndexForecastBundle> {
  const vixRegime = await getIndiaVixRegime();

  const rows: IndexForecastRow[] = [];
  for (const index of INDIAN_INDICES) {
    const sentiment = await analyzeIndexSentiment(index);
    const row = await forecastOneIndex(index, vixRegime, sentiment);
    if (row) rows.push(row);
  }

  const avg =
    rows.length ? Math.round(rows.reduce((s, r) => s + r.composite_score, 0) / rows.length) : 50;
  const daily_bias = biasFromScore(avg, true);
  const bull = rows.filter((r) => r.daily_forecast === "bullish").length;
  const bear = rows.filter((r) => r.daily_forecast === "bearish").length;
  const side = rows.filter((r) => r.daily_forecast === "sideways").length;

  const label =
    daily_bias === "bullish"
      ? "Broad index bias: Bullish"
      : daily_bias === "bearish"
        ? "Broad index bias: Bearish"
        : "Broad index bias: Sideways / mixed";

  const detail = `${bull} bullish · ${side} sideways · ${bear} bearish across ${rows.length} indices. VIX ${vixRegime.label}.`;

  return {
    indices: rows,
    market_summary: { daily_bias, label, detail },
    analyzed_at: new Date().toISOString(),
  };
}
