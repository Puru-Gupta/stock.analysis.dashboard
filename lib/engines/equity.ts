import { fetchLiveMarketBundle } from "@/lib/data/agents/orchestrator";
import { resampleBars } from "@/lib/data/sync";
import { INDEX_SYMBOL, normalizeSymbol, SECTORS, UNIVERSES, resolveFuturisticSymbols, resolveFuturisticTheme, futuristicThemeLabel } from "@/lib/data/universes";
import { computeSignalExpectancy } from "./expectancy";
import { combineDecision, scoreFundamentals } from "./fundamental";
import { buildEquityAdvantages } from "./intel";
import { evaluateIndexRegime } from "./regime";
import { computeTechnicalScores } from "./technical";
import { buildExitPlan, detectTradeMode } from "./trade-mode";
import {
  classifyValuationBracket,
  passesMarketCapBand,
  passesValuationFilter,
  type ValuationFilter,
} from "./valuation-brackets";

const SCAN_CONCURRENCY = 6;
const FUTURISTIC_MIN_TECH = 60;
const FUTURISTIC_MIN_FUND = 55;
const FUTURISTIC_MAX_PER_THEME = 5;

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function analyzeEquity(
  symbol: string,
  timeframe = "daily",
  niftyBarsCache?: Awaited<ReturnType<typeof fetchLiveMarketBundle>>["bars"],
  days = 365,
) {
  const sym = normalizeSymbol(symbol);
  const live = await fetchLiveMarketBundle(sym, { days });
  const bars = live.bars;
  if (!bars.length) return { error: `No price data for ${sym}`, symbol: sym };

  const resampled = resampleBars(bars, timeframe);
  const niftyBars =
    niftyBarsCache ?? (await fetchLiveMarketBundle(INDEX_SYMBOL, { days })).bars;
  const niftyResampled = resampleBars(niftyBars, timeframe);

  const technical = computeTechnicalScores(resampled, niftyResampled);
  if (live.quote > 0) {
    (technical as { current_price: number }).current_price = Math.round(live.quote * 100) / 100;
  }

  const regime = evaluateIndexRegime(niftyResampled.length ? niftyResampled : niftyBars);
  const tradeMode = detectTradeMode({
    active_setups: technical.active_setups,
    trend: technical.trend,
    rsi: technical.rsi,
    near_52w_high: technical.mvrb?.near_52w_high,
    ret_3m: technical.mvrb?.ret_3m,
    obv_divergence: technical.obv?.obv_divergence,
    bb_oversold: technical.strategy_confluence?.bollinger?.oversold,
  });

  const fundData = live.fundamentals;
  const fundamental = scoreFundamentals(fundData);
  const decision = combineDecision(technical, fundamental, {
    regime,
    tradeMode: tradeMode.mode,
  });

  const exitPlan = buildExitPlan({
    mode: tradeMode.mode,
    stop_loss: technical.stop_loss,
    support: technical.support,
    current_price: technical.current_price,
    atr: technical.atr,
    horizon: decision.horizon,
    invalidation: technical.invalidation,
  });

  const expectancy = computeSignalExpectancy(resampled, tradeMode.mode);

  const chartData = resampled.slice(-120).map((b) => ({
    date: b.date,
    open: Math.round(b.open * 100) / 100,
    high: Math.round(b.high * 100) / 100,
    low: Math.round(b.low * 100) / 100,
    close: Math.round(b.close * 100) / 100,
    volume: b.volume,
  }));

  const advantages = buildEquityAdvantages({
    signal: decision.signal,
    technical_score: technical.technical_score,
    fundamental_score: fundamental.fundamental_score,
    risk_reward: technical.risk_reward,
    trend: technical.trend,
    technical_signals: technical.technical_signals,
    fundamental_signals: fundamental.fundamental_signals,
    signal_diagnostics: {
      active_setups: technical.active_setups,
      obv: technical.obv,
      accumulation: technical.accumulation,
      vol_accum_breakout: technical.vol_accum_breakout,
    },
    quality: live.quality,
  });

  if (regime.state === "risk_on" && decision.signal === "Buy") {
    advantages.unshift({
      title: "Index risk-on",
      detail: regime.detail,
      weight: "high",
    });
  }
  if (expectancy.samples >= 8 && expectancy.avg_ret_20d > 0) {
    advantages.push({
      title: "Positive 20d expectancy proxy",
      detail: `Hit ${expectancy.hit_rate_20d}% · avg ${expectancy.avg_ret_20d}% over ${expectancy.samples} analogues`,
      weight: "edge",
    });
  }

  const modeLabel =
    tradeMode.mode === "trend"
      ? "Trend follow"
      : tradeMode.mode === "accumulate"
        ? "Accumulate on dip"
        : "Institutional gates";

  return {
    symbol: sym,
    name: fundData.name || sym.replace(".NS", ""),
    sector: fundData.sector,
    timeframe,
    ...decision,
    technical_view: technical.technical_score >= 65 ? "Strong" : technical.technical_score < 45 ? "Weak" : "Neutral",
    fundamental_view: fundamental.fundamental_view,
    entry_zone: technical.entry_zone,
    stop_loss: technical.stop_loss,
    target1: technical.target1,
    target2: technical.target2,
    risk_reward: technical.risk_reward,
    invalidation: exitPlan.invalidation,
    technical_signals: technical.technical_signals,
    fundamental_signals: fundamental.fundamental_signals,
    signal_diagnostics: {
      mvrb: technical.mvrb,
      accumulation: technical.accumulation,
      vol_accum_breakout: technical.vol_accum_breakout,
      obv: technical.obv,
      active_setups: technical.active_setups,
    },
    support: technical.support,
    resistance: technical.resistance,
    current_price: technical.current_price,
    atr: technical.atr,
    trend: technical.trend,
    fundamentals: fundData,
    index_regime: regime,
    trade_mode: tradeMode,
    exit_plan: exitPlan,
    expectancy,
    valuation_relative: {
      sector_key: fundamental.sector_norms.sector_key,
      pe_relative: fundamental.pe_relative,
      pb_relative: fundamental.pb_relative,
      peg: fundamental.peg,
      pe_median: fundamental.sector_norms.pe_median,
      pb_median: fundamental.sector_norms.pb_median,
    },
    score_breakdown: {
      trend: technical.trend_score,
      momentum: technical.momentum_score,
      volume: technical.volume_score,
      support_resistance: technical.sr_score,
      relative_strength: technical.rs_score,
      rsi: Math.round(technical.rsi),
      quality: fundamental.quality_score,
      valuation: fundamental.valuation_score,
      growth: fundamental.growth_score,
      debt: fundamental.debt_score,
    },
    chart_data: chartData,
    data_quality: live.quality,
    advantages: advantages.slice(0, 6),
    mode_details: {
      mode: tradeMode.mode === "none" ? timeframe : tradeMode.mode,
      label: `${modeLabel} · ${timeframe} · ${regime.label}`,
      objective:
        "Regime-gated multi-factor engine: tech≥65, fund≥55, sector-relative valuation, mode-aligned setups. Thresholds never loosened for signal count.",
      when_to_use: [
        tradeMode.mode === "accumulate"
          ? "Quiet accumulation / pre-breakout entries"
          : "Trend continuation with RS and volume confirmation",
        "Only when index regime allows longs",
        "Validate R:R ≥ 1.8 and respect time-stop exits",
      ],
      advantages: advantages.map((a) => a.title),
      risks: [...(decision.risks || []), ...exitPlan.reduce_if.slice(0, 2)],
      invalidation: exitPlan.invalidation,
      best_for: "Indian cash equity swings with regime + mode discipline.",
    },
    agent_quotes: live.quotes.filter((q) => q.ok).map((q) => ({
      source: q.source,
      last: q.last,
      latency_ms: q.latency_ms,
      change_pct: q.change_pct,
    })),
    agents_ms: live.agents_ms,
    sync: {
      symbol: sym,
      barsAdded: bars.length,
      totalBars: bars.length,
      lastBarDate: bars.at(-1)?.date || null,
      syncType: "full" as const,
    },
    analyzed_at: new Date().toISOString(),
  };
}

export async function scanUniverse(opts: {
  universe?: string;
  sector?: string;
  timeframe?: string;
  recommendation?: string;
  risk_level?: string;
  setup?: string;
  valuation?: ValuationFilter;
  /** Futuristic theme key or "all" */
  theme?: string;
  /** Liquid index scope for futuristic: nifty50|nifty100|nifty500|midcap|smallcap */
  scope?: string;
  limit?: number;
}) {
  const {
    universe = "nifty50",
    sector,
    timeframe = "daily",
    recommendation,
    risk_level,
    setup,
    valuation = "",
    theme = "all",
    scope = "nifty500",
    limit = 30,
  } = opts;

  const isFuturistic = universe === "futuristic";
  const effectiveLimit = isFuturistic ? Math.min(limit, 20) : limit;

  let symbols: string[];
  if (isFuturistic) {
    symbols = resolveFuturisticSymbols(theme, scope);
  } else if (universe === "sector" && sector) {
    symbols = SECTORS[sector] || SECTORS.IT;
  } else {
    symbols = UNIVERSES[universe] || UNIVERSES.nifty50;
  }

  // Scan full small universes; cap large ones but cover more than first 50 names
  const scanCap =
    symbols.length <= 30
      ? symbols.length
      : isFuturistic
        ? Math.min(symbols.length, 100)
        : universe === "nifty500"
          ? Math.min(symbols.length, 120)
          : Math.min(symbols.length, Math.max(effectiveLimit * 4, 80));
  const toScan = symbols.slice(0, scanCap);

  const niftyLive = await fetchLiveMarketBundle(INDEX_SYMBOL, { days: 365 });
  const niftyBars = niftyLive.bars;
  const regime = evaluateIndexRegime(niftyBars);

  const analyzed = await mapPool(toScan, SCAN_CONCURRENCY, async (sym) => {
    try {
      return await analyzeEquity(sym, timeframe, niftyBars);
    } catch {
      return { error: "failed", symbol: sym };
    }
  });

  type ScanRow = Record<string, unknown> & {
    symbol: string;
    final_score: number;
    technical_score: number;
    fundamental_score: number;
    signal: string;
    theme?: string;
    theme_label?: string;
    futuristic_rank_score?: number;
  };

  const results: ScanRow[] = [];
  for (const a of analyzed) {
    if (!a || "error" in a) continue;
    if (recommendation && a.signal.toLowerCase() !== recommendation.toLowerCase()) continue;
    if (risk_level && a.risk_level.toLowerCase() !== risk_level.toLowerCase()) continue;
    const diag = a.signal_diagnostics;
    if (setup === "obv_accumulation" && !diag?.obv?.obv_divergence) continue;
    if (setup === "volume_accumulation" && !diag?.accumulation?.volume_accumulation) continue;
    if (setup === "pre_breakout" && !diag?.accumulation?.signal) continue;
    if (setup === "vol_accum_breakout" && !diag?.vol_accum_breakout?.signal) continue;

    const fund = a.fundamentals || {};
    const pe_ratio = fund.pe_ratio ?? null;
    const pb_ratio = fund.pb_ratio ?? null;
    const market_cap = fund.market_cap ?? null;
    const valuation_bracket = classifyValuationBracket({
      pe_ratio,
      pb_ratio,
      revenue_growth: fund.revenue_growth,
      earnings_growth: fund.earnings_growth,
      market_cap,
      fundamental_score: a.fundamental_score,
      sector: fund.sector,
      industry: fund.industry,
    });

    if (!isFuturistic && !passesMarketCapBand(universe, market_cap)) continue;
    if (
      !isFuturistic &&
      !passesValuationFilter({
        universe,
        valuation,
        bracket: valuation_bracket,
        fundamental_score: a.fundamental_score,
      })
    ) {
      continue;
    }

    // Futuristic quality sleeve — softer than Buy gate, still institutional hygiene
    if (isFuturistic) {
      if (a.technical_score < FUTURISTIC_MIN_TECH || a.fundamental_score < FUTURISTIC_MIN_FUND) continue;
      if (a.signal === "Avoid") continue;
      if (a.trend === "downtrend") continue;
      const rs = a.score_breakdown?.relative_strength ?? 50;
      // RS score is 0–100 style from tech engine; also check mvrb if present
      const rsRatio = a.signal_diagnostics?.mvrb?.rs_vs_nifty;
      if (rsRatio != null && rsRatio < 0.85) continue;
      if (rsRatio == null && rs < 40) continue;

      const rg = Number(fund.revenue_growth ?? NaN);
      const eg = Number(fund.earnings_growth ?? NaN);
      const hasGrowth = (Number.isFinite(rg) && rg >= 0.08) || (Number.isFinite(eg) && eg >= 0.08);
      // Require growth evidence OR solid fund (≥60) — thematic PMs avoid value traps in growth sleeves
      if (!hasGrowth && a.fundamental_score < 60) continue;

      // Allow premium valuation on growth themes; block expensive without strong growth
      if (valuation_bracket === "expensive") {
        const strongGrowth = (Number.isFinite(rg) && rg >= 0.15) || (Number.isFinite(eg) && eg >= 0.15);
        if (!strongGrowth) continue;
      }
    }

    const themeKey = resolveFuturisticTheme(a.symbol);
    const growthBonus =
      Math.max(0, Number(fund.revenue_growth ?? 0) * 20) +
      Math.max(0, Number(fund.earnings_growth ?? 0) * 15);
    const futuristic_rank_score = Math.round(
      a.final_score * 0.7 + a.technical_score * 0.15 + a.fundamental_score * 0.1 + Math.min(15, growthBonus),
    );

    const {
      chart_data,
      fundamentals,
      score_breakdown,
      sync,
      signal_diagnostics,
      agent_quotes,
      mode_details,
      exit_plan,
      expectancy,
      valuation_relative,
      index_regime,
      trade_mode,
      ...rest
    } = a;
    results.push({
      ...rest,
      pe_ratio,
      pb_ratio,
      market_cap,
      valuation_bracket,
      trade_mode: trade_mode?.mode,
      regime: index_regime?.state,
      exp_20d: expectancy?.avg_ret_20d,
      hit_20d: expectancy?.hit_rate_20d,
      pe_rel: valuation_relative?.pe_relative,
      obv_divergence: diag?.obv?.obv_divergence ?? false,
      volume_accumulation: diag?.accumulation?.volume_accumulation ?? false,
      pre_breakout: diag?.accumulation?.signal ?? false,
      vol_accum_breakout: diag?.vol_accum_breakout?.signal ?? false,
      price_chg_15d: diag?.obv?.price_change_15d_pct ?? 0,
      accuracy_score: a.data_quality?.accuracy_score,
      index_regime_label: regime.label,
      theme: themeKey,
      theme_label: themeKey ? futuristicThemeLabel(themeKey) : undefined,
      futuristic_rank_score,
    });
  }

  if (isFuturistic) {
    results.sort((a, b) => (b.futuristic_rank_score ?? b.final_score) - (a.futuristic_rank_score ?? a.final_score));
    // Theme diversification when scanning All themes
    if (!theme || theme === "all") {
      const diversified: ScanRow[] = [];
      const themeCount: Record<string, number> = {};
      for (const row of results) {
        const t = row.theme || "other";
        if ((themeCount[t] || 0) >= FUTURISTIC_MAX_PER_THEME) continue;
        diversified.push(row);
        themeCount[t] = (themeCount[t] || 0) + 1;
        if (diversified.length >= effectiveLimit) break;
      }
      return diversified;
    }
    return results.slice(0, effectiveLimit);
  }

  return results.sort((a, b) => b.final_score - a.final_score).slice(0, effectiveLimit);
}
