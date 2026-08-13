import { fetchLiveMarketBundle } from "@/lib/data/agents/orchestrator";
import { getPriceHistory } from "@/lib/data/sync";
import { INDEX_SYMBOL, normalizeSymbol, SECTORS, UNIVERSES } from "@/lib/data/universes";
import { analyzeEquity } from "./equity";
import { evaluateIndexRegime } from "./regime";

import { ATR_STOP_MULTIPLIER, lookbackMonthsToDays, parseLookbackMonths, type LookbackMonths } from "@/lib/rebalancing-constants";
const MIN_FUND_SCORE = 55;
const MIN_TECH_SCORE = 55;
const MAX_PER_SECTOR = 2;
export const REBALANCE_MIN_COMPOSITE = 60;
export const REBALANCE_MAX_PICKS = 10;
const SCAN_CONCURRENCY = 6;

export type RebalanceGoal = "growth" | "balanced" | "income" | "defensive";
export type AnalysisBias = "balanced" | "fundamental" | "technical" | "adaptive";
export type PortfolioSignal = "BUY" | "HOLD" | "SELL";

export interface RebalancePick {
  symbol: string;
  name: string;
  sector?: string;
  signal: PortfolioSignal;
  composite_score: number;
  technical_score: number;
  fundamental_score: number;
  current_price: number;
  atr: number;
  atr_stop: number;
  target_weight_pct: number;
  suggested_amount: number;
  suggested_qty: number;
  risk_reward: number;
  trend: string;
  thesis: string;
  rank: number;
}

export interface RebalanceScanResult {
  month_label: string;
  goal: RebalanceGoal;
  universe: string;
  analysis_bias: AnalysisBias;
  lookback_months: LookbackMonths;
  monthly_capital: number;
  regime: { label: string; state: string; detail: string };
  picks: RebalancePick[];
  watchlist: RebalancePick[];
  scanned: number;
  note: string;
  analyzed_at: string;
}

export interface PortfolioHoldingInput {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  atrAtEntry: number;
  atrStop: number;
  peakPrice?: number;
}

export interface PortfolioRow {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  entry_price: number;
  entry_date: string;
  current_price: number;
  market_value: number;
  invested: number;
  pnl: number;
  pnl_pct: number;
  weight_pct: number;
  atr: number;
  atr_stop: number;
  trailing_stop: boolean;
  stop_distance_pct: number;
  signal: PortfolioSignal;
  composite_score: number;
  rank: number | null;
  reasons: string[];
}

export interface BenchmarkRow {
  label: string;
  return_pct: number;
  since: string;
}

export interface StopUpdate {
  id: string;
  atr_stop: number;
  peak_price: number;
}

export interface PortfolioEvaluateResult {
  holdings: PortfolioRow[];
  summary: {
    invested: number;
    current_value: number;
    pnl: number;
    pnl_pct: number;
    holdings_count: number;
  };
  benchmarks: BenchmarkRow[];
  new_buy_ideas: RebalancePick[];
  stop_updates: StopUpdate[];
  analyzed_at: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

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

function sectorOf(symbol: string, sector?: string): string {
  if (sector) return sector;
  for (const [key, syms] of Object.entries(SECTORS)) {
    if (syms.includes(symbol)) return key;
  }
  return "Other";
}

function goalWeights(goal: RebalanceGoal, bias: AnalysisBias, regimeState: string) {
  let tech = 0.35;
  let fund = 0.4;
  let extra = 0.25;

  if (goal === "growth") {
    tech = 0.4;
    fund = 0.3;
    extra = 0.3;
  } else if (goal === "income") {
    tech = 0.25;
    fund = 0.5;
    extra = 0.25;
  } else if (goal === "defensive") {
    tech = 0.25;
    fund = 0.55;
    extra = 0.2;
  }

  if (bias === "fundamental") {
    fund += 0.12;
    tech -= 0.12;
  } else if (bias === "technical") {
    tech += 0.12;
    fund -= 0.12;
  } else if (bias === "adaptive") {
    if (regimeState === "risk_on") {
      tech += 0.08;
      extra += 0.04;
      fund -= 0.12;
    } else if (regimeState === "risk_off") {
      fund += 0.1;
      tech -= 0.1;
    }
  }

  return { tech, fund, extra };
}

function incomeBonus(fundamentals: Record<string, unknown> | undefined): number {
  const dy = Number(fundamentals?.dividend_yield ?? 0);
  if (dy >= 0.03) return 12;
  if (dy >= 0.02) return 8;
  if (dy >= 0.015) return 4;
  return 0;
}

function defensiveBonus(fundamentals: Record<string, unknown> | undefined, fundamentalScore: number): number {
  let b = 0;
  if (fundamentalScore >= 70) b += 6;
  const de = Number(fundamentals?.debt_to_equity ?? 999);
  if (de <= 0.5) b += 6;
  else if (de <= 1) b += 3;
  return b;
}

function growthBonus(technicalScore: number, trend: string, rsScore?: number): number {
  let b = 0;
  if (trend === "uptrend") b += 8;
  if (technicalScore >= 75) b += 6;
  if (rsScore != null && rsScore >= 75) b += 6;
  return b;
}

export type CompositeAnalysisInput = {
  fundamental_score: number;
  technical_score: number;
  final_score: number;
  signal: string;
  trend: string;
  risk_reward: number;
  score_breakdown?: { relative_strength?: number };
  fundamentals?: Record<string, unknown>;
};

export function compositeScore(
  analysis: CompositeAnalysisInput | Awaited<ReturnType<typeof analyzeEquity>>,
  goal: RebalanceGoal,
  bias: AnalysisBias,
  regimeState: string,
): number {
  if (!analysis || "error" in analysis) return 0;
  if (analysis.fundamental_score < MIN_FUND_SCORE || analysis.technical_score < MIN_TECH_SCORE) return 0;
  if (analysis.signal === "Avoid") return 0;

  const w = goalWeights(goal, bias, regimeState);
  const breakdown = analysis.score_breakdown || {};
  const rs = breakdown.relative_strength ?? 50;

  let extra = 0;
  if (goal === "income") extra = incomeBonus(analysis.fundamentals as unknown as Record<string, unknown>);
  else if (goal === "defensive") extra = defensiveBonus(analysis.fundamentals as unknown as Record<string, unknown>, analysis.fundamental_score);
  else if (goal === "growth") extra = growthBonus(analysis.technical_score, analysis.trend, rs);

  if (analysis.risk_reward >= 2) extra += 4;
  if (analysis.signal === "Buy") extra += 6;
  else if (analysis.signal === "Watch") extra += 2;

  const score =
    analysis.technical_score * w.tech +
    analysis.fundamental_score * w.fund +
    (analysis.final_score * 0.6 + extra) * w.extra;

  return Math.round(Math.min(100, Math.max(0, score)));
}

export function atrStopLong(entry: number, atr: number) {
  return r2(Math.max(0, entry - atr * ATR_STOP_MULTIPLIER));
}

/** Ratcheting trailing stop: never moves down; trails price − mult×ATR. */
export function trailingAtrStop(fixedStop: number, peakPrice: number, currentAtr: number) {
  const trail = r2(Math.max(0, peakPrice - currentAtr * ATR_STOP_MULTIPLIER));
  return r2(Math.max(fixedStop, trail));
}

export function riskParityWeights(picks: { symbol: string; atr: number; price: number }[]) {
  const inv = picks.map((p) => {
    const volPct = Math.max(0.008, p.atr / Math.max(p.price, 1));
    return { symbol: p.symbol, inv: 1 / volPct };
  });
  const total = inv.reduce((a, b) => a + b.inv, 0) || 1;
  const map: Record<string, number> = {};
  for (const row of inv) map[row.symbol] = r2((row.inv / total) * 100);
  return map;
}

export function diversifyPicks<T extends { symbol: string; sector?: string; composite_score: number }>(
  ranked: T[],
  target = 10,
): T[] {
  const out: T[] = [];
  const sectorCount: Record<string, number> = {};
  for (const row of ranked) {
    const sec = sectorOf(row.symbol, row.sector);
    if ((sectorCount[sec] || 0) >= MAX_PER_SECTOR) continue;
    out.push(row);
    sectorCount[sec] = (sectorCount[sec] || 0) + 1;
    if (out.length >= target) break;
  }
  if (out.length < Math.min(8, ranked.length)) {
    for (const row of ranked) {
      if (out.find((x) => x.symbol === row.symbol)) continue;
      out.push(row);
      if (out.length >= Math.min(8, target)) break;
    }
  }
  return out;
}

function buildThesis(analysis: Awaited<ReturnType<typeof analyzeEquity>>): string {
  if ("error" in analysis) return "";
  const parts: string[] = [];
  parts.push(`${analysis.trend} · Tech ${analysis.technical_score} / Fund ${analysis.fundamental_score}`);
  if (analysis.technical_signals?.[0]) parts.push(analysis.technical_signals[0]);
  if (analysis.fundamental_signals?.[0]) parts.push(analysis.fundamental_signals[0]);
  return parts.slice(0, 3).join(" · ");
}

function resolveSymbols(universe: string, customSymbols?: string[]) {
  if (universe === "custom" && customSymbols?.length) {
    return [...new Set(customSymbols.map(normalizeSymbol))];
  }
  const list = UNIVERSES[universe] || UNIVERSES.nifty50;
  const cap = universe === "nifty500" ? 100 : universe === "nifty100" ? 80 : list.length;
  return list.slice(0, cap);
}

export async function scanMonthlyRebalance(opts: {
  goal?: RebalanceGoal;
  universe?: string;
  analysis_bias?: AnalysisBias;
  lookback_months?: number;
  monthly_capital?: number;
  custom_symbols?: string[];
  limit?: number;
}): Promise<RebalanceScanResult> {
  const goal = opts.goal || "balanced";
  const universe = opts.universe || "nifty50";
  const analysis_bias = opts.analysis_bias || "balanced";
  const lookback_months = parseLookbackMonths(opts.lookback_months);
  const historyDays = lookbackMonthsToDays(lookback_months);
  const monthly_capital = opts.monthly_capital || 100_000;
  const limit = opts.limit || 10;

  const symbols = resolveSymbols(universe, opts.custom_symbols);
  const niftyLive = await fetchLiveMarketBundle(INDEX_SYMBOL, { days: historyDays });
  const regime = evaluateIndexRegime(niftyLive.bars);

  const analyzed = await mapPool(symbols, SCAN_CONCURRENCY, async (sym) => {
    try {
      return await analyzeEquity(sym, "daily", niftyLive.bars, historyDays);
    } catch {
      return { error: "failed", symbol: sym };
    }
  });

  type Candidate = RebalancePick & { sector?: string };
  const candidates: Candidate[] = [];

  for (const a of analyzed) {
    if (!a || "error" in a) continue;
    const score = compositeScore(a, goal, analysis_bias, regime.state);
    if (score < 60) continue;

    const price = a.current_price;
    const atr = a.atr || Math.max(price * 0.02, 1);
    candidates.push({
      symbol: a.symbol,
      name: a.name,
      sector: a.sector,
      signal: a.signal === "Buy" ? "BUY" : "HOLD",
      composite_score: score,
      technical_score: a.technical_score,
      fundamental_score: a.fundamental_score,
      current_price: price,
      atr: r2(atr),
      atr_stop: atrStopLong(price, atr),
      target_weight_pct: 0,
      suggested_amount: 0,
      suggested_qty: 0,
      risk_reward: a.risk_reward,
      trend: a.trend,
      thesis: buildThesis(a),
      rank: 0,
    });
  }

  candidates.sort((a, b) => b.composite_score - a.composite_score);
  const selected = diversifyPicks(candidates, limit);
  const weights = riskParityWeights(
    selected.map((p) => ({ symbol: p.symbol, atr: p.atr, price: p.current_price })),
  );

  const picks: RebalancePick[] = selected.map((p, i) => {
    const wt = weights[p.symbol] || r2(100 / selected.length);
    const amount = r2((monthly_capital * wt) / 100);
    const qty = Math.max(1, Math.floor(amount / p.current_price));
    return {
      ...p,
      target_weight_pct: wt,
      suggested_amount: amount,
      suggested_qty: qty,
      rank: i + 1,
    };
  });

  const watchlist = candidates
    .filter((c) => !selected.find((s) => s.symbol === c.symbol))
    .slice(0, 15)
    .map((p, i) => ({ ...p, rank: picks.length + i + 1 }));

  const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return {
    month_label: monthLabel,
    goal,
    universe,
    analysis_bias,
    lookback_months,
    monthly_capital,
    regime: { label: regime.label, state: regime.state, detail: regime.detail },
    picks,
    watchlist,
    scanned: symbols.length,
    note: `Scored ${candidates.length} names passing funda≥${MIN_FUND_SCORE} & tech≥${MIN_TECH_SCORE} using ${lookback_months}mo history. ATR stop = entry − ${ATR_STOP_MULTIPLIER}×ATR(14), trailing on portfolio review. Weights are risk-parity (inverse volatility).`,
    analyzed_at: new Date().toISOString(),
  };
}

async function indexReturnSince(since: string, indexSym: string): Promise<number | null> {
  try {
    const { bars } = await getPriceHistory(indexSym, 400);
    if (bars.length < 2) return null;
    const startIdx = bars.findIndex((b) => b.date >= since);
    const start = startIdx >= 0 ? bars[startIdx].close : bars[0].close;
    const end = bars.at(-1)!.close;
    return r2(((end - start) / start) * 100);
  } catch {
    return null;
  }
}

export function holdingSignal(input: {
  price: number;
  atrStop: number;
  compositeScore: number;
  rank: number | null;
  scanSize: number;
  trend: string;
  originalSignal: string;
}): { signal: PortfolioSignal; reasons: string[] } {
  const reasons: string[] = [];

  if (input.price <= input.atrStop) {
    reasons.push(`ATR stop hit (≤ ₹${input.atrStop})`);
    return { signal: "SELL", reasons };
  }

  if (input.compositeScore > 0 && input.compositeScore < 50) {
    reasons.push("Composite score collapsed below 50");
    return { signal: "SELL", reasons };
  }

  if (input.rank != null && input.rank > Math.max(15, input.scanSize)) {
    reasons.push("Fell out of top ranks vs current scan");
    return { signal: "SELL", reasons };
  }

  if (input.trend === "downtrend" && input.compositeScore < 60) {
    reasons.push("Trend breakdown with weak score");
    return { signal: "SELL", reasons };
  }

  if (input.originalSignal === "Avoid") {
    reasons.push("Engine flag: Avoid");
    return { signal: "SELL", reasons };
  }

  if (input.rank != null && input.rank <= 10) reasons.push(`Top-tier rank #${input.rank}`);
  else reasons.push("Thesis intact — no exit trigger");

  return { signal: "HOLD", reasons };
}

export async function evaluateVirtualPortfolio(
  holdings: PortfolioHoldingInput[],
  scan?: RebalanceScanResult,
): Promise<PortfolioEvaluateResult> {
  if (!holdings.length) {
    return {
      holdings: [],
      summary: { invested: 0, current_value: 0, pnl: 0, pnl_pct: 0, holdings_count: 0 },
      benchmarks: [],
      new_buy_ideas: scan?.picks.filter((p) => p.signal === "BUY").slice(0, 5) || [],
      stop_updates: [],
      analyzed_at: new Date().toISOString(),
    };
  }

  const historyDays = lookbackMonthsToDays(scan?.lookback_months ?? 12);
  const niftyLive = await fetchLiveMarketBundle(INDEX_SYMBOL, { days: historyDays });
  const rankMap = new Map<string, { rank: number; score: number; trend: string; signal: string; atr: number }>();
  const allScan = [...(scan?.picks || []), ...(scan?.watchlist || [])];
  for (const p of allScan) {
    rankMap.set(p.symbol, {
      rank: p.rank,
      score: p.composite_score,
      trend: p.trend,
      signal: p.signal,
      atr: p.atr,
    });
  }

  const rows: PortfolioRow[] = [];
  const stopUpdates: StopUpdate[] = [];
  let invested = 0;
  let currentValue = 0;

  for (const h of holdings) {
    let price = h.entryPrice;
    let atr = h.atrAtEntry;
    let composite = rankMap.get(h.symbol)?.score ?? 0;
    let trend = rankMap.get(h.symbol)?.trend ?? "unknown";
    let engSignal = rankMap.get(h.symbol)?.signal ?? "HOLD";
    let rank = rankMap.get(h.symbol)?.rank ?? null;

    try {
      const live = await analyzeEquity(h.symbol, "daily", niftyLive.bars, historyDays);
      if (!("error" in live)) {
        price = live.current_price;
        atr = live.atr || atr;
        composite =
          composite ||
          compositeScore(live, scan?.goal || "balanced", scan?.analysis_bias || "balanced", "neutral");
        trend = live.trend;
        engSignal = live.signal;
        if (rank == null && scan) {
          const idx = allScan.findIndex((p) => p.symbol === h.symbol);
          if (idx >= 0) rank = allScan[idx].rank;
        }
      }
    } catch {
      /* keep entry fallback */
    }

    const fixedStop = atrStopLong(h.entryPrice, h.atrAtEntry);
    const peakPrice = Math.max(h.peakPrice ?? h.entryPrice, price);
    const stop = trailingAtrStop(fixedStop, peakPrice, atr);
    const trailingApplied = stop > (h.atrStop || fixedStop) + 0.01;

    stopUpdates.push({ id: h.id, atr_stop: stop, peak_price: peakPrice });

    const { signal, reasons } = holdingSignal({
      price,
      atrStop: stop,
      compositeScore: composite,
      rank,
      scanSize: allScan.length,
      trend,
      originalSignal: engSignal,
    });

    if (trailingApplied) {
      reasons.unshift(`Trailing ATR stop raised to ₹${stop}`);
    }

    const inv = h.entryPrice * h.quantity;
    const mv = price * h.quantity;
    invested += inv;
    currentValue += mv;

    rows.push({
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      entry_price: h.entryPrice,
      entry_date: h.entryDate,
      current_price: price,
      market_value: r2(mv),
      invested: r2(inv),
      pnl: r2(mv - inv),
      pnl_pct: inv > 0 ? r2(((mv - inv) / inv) * 100) : 0,
      weight_pct: 0,
      atr: r2(atr),
      atr_stop: stop,
      trailing_stop: trailingApplied,
      stop_distance_pct: price > 0 ? r2(((price - stop) / price) * 100) : 0,
      signal,
      composite_score: composite,
      rank,
      reasons,
    });
  }

  for (const row of rows) {
    row.weight_pct = currentValue > 0 ? r2((row.market_value / currentValue) * 100) : 0;
  }

  const since = holdings.reduce((min, h) => (h.entryDate < min ? h.entryDate : min), holdings[0].entryDate);
  const benchmarks: BenchmarkRow[] = [];
  const n50 = await indexReturnSince(since, INDEX_SYMBOL);
  if (n50 != null) benchmarks.push({ label: "NIFTY 50", return_pct: n50, since });
  benchmarks.push({ label: "NIFTY 100 (proxy)", return_pct: n50 ?? 0, since });

  const held = new Set(holdings.map((h) => h.symbol));
  const newBuyIdeas = scan?.picks.filter((p) => p.signal === "BUY" && !held.has(p.symbol)).slice(0, 5) || [];

  const pnl = currentValue - invested;
  return {
    holdings: rows.sort((a, b) => b.market_value - a.market_value),
    summary: {
      invested: r2(invested),
      current_value: r2(currentValue),
      pnl: r2(pnl),
      pnl_pct: invested > 0 ? r2((pnl / invested) * 100) : 0,
      holdings_count: rows.length,
    },
    benchmarks,
    new_buy_ideas: newBuyIdeas,
    stop_updates: stopUpdates,
    analyzed_at: new Date().toISOString(),
  };
}
