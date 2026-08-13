import { ensureHistoryDepth, getFundamentals, getPriceHistory } from "@/lib/data/sync";
import type { FundamentalsData, OHLCVBar } from "@/lib/data/types";
import { INDEX_SYMBOL, SECTORS, UNIVERSES } from "@/lib/data/universes";
import { lookbackMonthsToDays, parseLookbackMonths, type LookbackMonths } from "@/lib/rebalancing-constants";
import { combineDecision, scoreFundamentals } from "./fundamental";
import {
  atrStopLong,
  compositeScore,
  diversifyPicks,
  holdingSignal,
  riskParityWeights,
  trailingAtrStop,
  REBALANCE_MAX_PICKS,
  REBALANCE_MIN_COMPOSITE,
  type AnalysisBias,
  type CompositeAnalysisInput,
  type RebalanceGoal,
} from "./rebalancing";
import { evaluateIndexRegime } from "./regime";
import { computeAtr, computeTechnicalScores } from "./technical";

const REBALANCE_EVERY = 21;

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface BacktestPoint {
  date: string;
  portfolio_value: number;
  benchmark_value: number;
  drawdown_pct: number;
}

export interface BacktestResult {
  lookback_months: LookbackMonths;
  universe: string;
  goal: RebalanceGoal;
  analysis_bias: AnalysisBias;
  monthly_capital: number;
  start_date: string;
  end_date: string;
  total_return_pct: number;
  benchmark_return_pct: number;
  max_drawdown_pct: number;
  rebalance_count: number;
  stop_out_count: number;
  rotation_count: number;
  win_rate_pct: number;
  equity_curve: BacktestPoint[];
  note: string;
  analyzed_at: string;
}

interface SimPosition {
  symbol: string;
  qty: number;
  entry: number;
  fixedStop: number;
  peak: number;
  atr: number;
}

interface ScoredCandidate {
  symbol: string;
  composite_score: number;
  technical_score: number;
  fundamental_score: number;
  trend: string;
  signal: string;
  price: number;
  atr: number;
  rank: number;
}

function sectorOf(symbol: string): string {
  for (const [key, syms] of Object.entries(SECTORS)) {
    if (syms.includes(symbol)) return key;
  }
  return "Other";
}

function sliceToDate(bars: OHLCVBar[], date: string): OHLCVBar[] {
  const idx = bars.findIndex((b) => b.date > date);
  const end = idx >= 0 ? idx : bars.length;
  return bars.slice(0, end);
}

function priceOn(bars: OHLCVBar[], date: string): number | null {
  const bar = bars.find((b) => b.date === date) ?? bars.filter((b) => b.date <= date).at(-1);
  return bar?.close ?? null;
}

async function loadHistories(symbols: string[], days: number): Promise<Map<string, OHLCVBar[]>> {
  const map = new Map<string, OHLCVBar[]>();
  await Promise.all(
    symbols.map(async (sym) => {
      await ensureHistoryDepth(sym, days);
      const { bars } = await getPriceHistory(sym, days);
      if (bars.length) map.set(sym, bars);
    }),
  );
  return map;
}

async function loadFundamentals(symbols: string[]): Promise<Map<string, FundamentalsData>> {
  const map = new Map<string, FundamentalsData>();
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        map.set(sym, await getFundamentals(sym));
      } catch {
        /* skip */
      }
    }),
  );
  return map;
}

function scoreAtDate(
  symbol: string,
  bars: OHLCVBar[],
  niftyBars: OHLCVBar[],
  fund: FundamentalsData | undefined,
  goal: RebalanceGoal,
  bias: AnalysisBias,
  regimeState: string,
): ScoredCandidate | null {
  if (bars.length < 66) return null;
  const tech = computeTechnicalScores(bars, niftyBars);
  const fundScored = scoreFundamentals(fund || { symbol });
  const regime = evaluateIndexRegime(niftyBars);
  const decision = combineDecision(tech, fundScored, { regime });
  const analysis: CompositeAnalysisInput = {
    fundamental_score: fundScored.fundamental_score,
    technical_score: tech.technical_score,
    final_score: decision.final_score,
    signal: decision.signal,
    trend: tech.trend,
    risk_reward: tech.risk_reward,
    score_breakdown: { relative_strength: tech.rs_score },
    fundamentals: fund as unknown as Record<string, unknown>,
  };
  const composite = compositeScore(analysis, goal, bias, regimeState);
  if (composite < REBALANCE_MIN_COMPOSITE) return null;
  return {
    symbol,
    composite_score: composite,
    technical_score: tech.technical_score,
    fundamental_score: fundScored.fundamental_score,
    trend: tech.trend,
    signal: decision.signal,
    price: bars.at(-1)!.close,
    atr: tech.atr || bars.at(-1)!.close * 0.02,
    rank: 0,
  };
}

function rankCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  return candidates
    .sort((a, b) => b.composite_score - a.composite_score)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

function fillVacancies(
  ranked: ScoredCandidate[],
  held: SimPosition[],
  maxPicks: number,
): ScoredCandidate[] {
  const heldSyms = new Set(held.map((p) => p.symbol));
  const sectorCount: Record<string, number> = {};
  for (const p of held) {
    const sec = sectorOf(p.symbol);
    sectorCount[sec] = (sectorCount[sec] || 0) + 1;
  }
  const out: ScoredCandidate[] = [];
  for (const row of ranked) {
    if (heldSyms.has(row.symbol)) continue;
    if (held.length + out.length >= maxPicks) break;
    const sec = sectorOf(row.symbol);
    if ((sectorCount[sec] || 0) >= 2) continue;
    out.push(row);
    sectorCount[sec] = (sectorCount[sec] || 0) + 1;
  }
  return out;
}

function deployToPicks(
  cash: number,
  picks: ScoredCandidate[],
): { positions: SimPosition[]; leftover: number } {
  if (!picks.length || cash <= 0) return { positions: [], leftover: cash };
  const weights = riskParityWeights(picks.map((p) => ({ symbol: p.symbol, atr: p.atr, price: p.price })));
  const out: SimPosition[] = [];
  let leftover = 0;
  for (const pick of picks) {
    const wt = (weights[pick.symbol] || 0) / 100;
    const amount = cash * wt;
    const px = pick.price;
    const qty = Math.max(1, Math.floor(amount / px));
    const spent = qty * px;
    leftover += amount - spent;
    out.push({
      symbol: pick.symbol,
      qty,
      entry: px,
      fixedStop: atrStopLong(px, pick.atr),
      peak: px,
      atr: pick.atr,
    });
  }
  return { positions: out, leftover };
}

export async function runRebalanceBacktest(opts: {
  universe?: string;
  lookback_months?: number;
  monthly_capital?: number;
  goal?: RebalanceGoal;
  analysis_bias?: AnalysisBias;
}): Promise<BacktestResult> {
  const universe = opts.universe || "nifty50";
  const lookback_months = parseLookbackMonths(opts.lookback_months);
  const monthly_capital = opts.monthly_capital || 100_000;
  const goal = opts.goal || "balanced";
  const analysis_bias = opts.analysis_bias || "balanced";
  const days = lookbackMonthsToDays(lookback_months);
  const symbols = (UNIVERSES[universe] || UNIVERSES.nifty50).slice(0, universe === "nifty50" ? 50 : 80);

  await ensureHistoryDepth(INDEX_SYMBOL, days);
  const [{ bars: niftyBars }, histories, fundamentals] = await Promise.all([
    getPriceHistory(INDEX_SYMBOL, days),
    loadHistories(symbols, days),
    loadFundamentals(symbols),
  ]);

  if (niftyBars.length < REBALANCE_EVERY * 3) {
    throw new Error("Insufficient index history for backtest — ensure Supabase has price data synced.");
  }

  const warmup = Math.min(200, Math.floor(niftyBars.length * 0.15));
  const simBars = niftyBars.slice(warmup);

  let cash = monthly_capital;
  let positions: SimPosition[] = [];
  let peakNav = monthly_capital;
  let maxDrawdown = 0;
  let rebalanceCount = 0;
  let stopOutCount = 0;
  let rotationCount = 0;
  let closedWins = 0;
  let closedTotal = 0;

  const curve: BacktestPoint[] = [];
  const benchStart = simBars[0].close;

  for (let i = 0; i < simBars.length; i++) {
    const date = simBars[i].date;
    const niftySlice = sliceToDate(niftyBars, date);

    // Daily trailing ATR stop checks
    const afterStops: SimPosition[] = [];
    for (const pos of positions) {
      const bars = histories.get(pos.symbol);
      if (!bars) continue;
      const px = priceOn(bars, date);
      if (px == null) continue;
      const slice = sliceToDate(bars, date);
      const atr = computeAtr(slice) || pos.atr;
      const peak = Math.max(pos.peak, px);
      const stop = trailingAtrStop(pos.fixedStop, peak, atr);
      if (px <= stop) {
        cash += px * pos.qty;
        stopOutCount++;
        closedTotal++;
        if (px > pos.entry) closedWins++;
        continue;
      }
      afterStops.push({ ...pos, peak, atr });
    }
    positions = afterStops;

    // Partial monthly rebalance — keep winners, rotate laggards only
    if (i % REBALANCE_EVERY === 0 && niftySlice.length >= 66) {
      rebalanceCount++;
      const regime = evaluateIndexRegime(niftySlice);

      const candidates: ScoredCandidate[] = [];
      for (const sym of symbols) {
        const bars = histories.get(sym);
        if (!bars) continue;
        const slice = sliceToDate(bars, date);
        const niftyHist = sliceToDate(niftyBars, date);
        const scored = scoreAtDate(sym, slice, niftyHist, fundamentals.get(sym), goal, analysis_bias, regime.state);
        if (scored) candidates.push(scored);
      }
      const ranked = rankCandidates(candidates);
      const rankMap = new Map(ranked.map((c) => [c.symbol, c]));

      const kept: SimPosition[] = [];
      for (const pos of positions) {
        const bars = histories.get(pos.symbol);
        if (!bars) continue;
        const px = priceOn(bars, date) ?? pos.entry;
        const slice = sliceToDate(bars, date);
        const atr = computeAtr(slice) || pos.atr;
        const peak = Math.max(pos.peak, px);
        const stop = trailingAtrStop(pos.fixedStop, peak, atr);
        const meta = rankMap.get(pos.symbol);
        const { signal } = holdingSignal({
          price: px,
          atrStop: stop,
          compositeScore: meta?.composite_score ?? 0,
          rank: meta?.rank ?? null,
          scanSize: ranked.length,
          trend: meta?.trend ?? "unknown",
          originalSignal: meta?.signal ?? "Watch",
        });
        if (signal === "SELL") {
          cash += px * pos.qty;
          rotationCount++;
          closedTotal++;
          if (px > pos.entry) closedWins++;
        } else {
          kept.push({ ...pos, peak, atr });
        }
      }
      positions = kept;

      const slots = REBALANCE_MAX_PICKS - positions.length;
      if (slots > 0 && regime.allows_long && cash > 0) {
        const initial = positions.length === 0;
        const newPicks = initial
          ? diversifyPicks(ranked, REBALANCE_MAX_PICKS)
          : fillVacancies(ranked, positions, REBALANCE_MAX_PICKS);
        const deployable = cash;
        cash = 0;
        const { positions: added, leftover } = deployToPicks(deployable, newPicks);
        cash = leftover;
        positions = [...positions, ...added];
      }
    }

    let nav = cash;
    for (const pos of positions) {
      const px = priceOn(histories.get(pos.symbol)!, date) ?? pos.entry;
      nav += px * pos.qty;
    }
    peakNav = Math.max(peakNav, nav);
    const dd = peakNav > 0 ? ((peakNav - nav) / peakNav) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);

    if (i % 5 === 0 || i === simBars.length - 1) {
      const benchVal = (simBars[i].close / benchStart) * monthly_capital;
      curve.push({
        date,
        portfolio_value: r2(nav),
        benchmark_value: r2(benchVal),
        drawdown_pct: r2(dd),
      });
    }
  }

  const finalNav = curve.at(-1)?.portfolio_value ?? monthly_capital;
  const benchFinal = curve.at(-1)?.benchmark_value ?? monthly_capital;

  return {
    lookback_months,
    universe,
    goal,
    analysis_bias,
    monthly_capital,
    start_date: simBars[0]?.date ?? "",
    end_date: simBars.at(-1)?.date ?? "",
    total_return_pct: r2(((finalNav - monthly_capital) / monthly_capital) * 100),
    benchmark_return_pct: r2(((benchFinal - monthly_capital) / monthly_capital) * 100),
    max_drawdown_pct: r2(maxDrawdown),
    rebalance_count: rebalanceCount,
    stop_out_count: stopOutCount,
    rotation_count: rotationCount,
    win_rate_pct: closedTotal > 0 ? r2((closedWins / closedTotal) * 100) : 0,
    equity_curve: curve,
    note: `Walk-forward backtest aligned with live rebalancing: composite score (funda+tech), partial rebalance (keep winners, rotate laggards only), regime gate for new buys, trailing ATR stops. Fundamentals use latest cached snapshot (not point-in-time) — treat as directional, not audit-grade.`,
    analyzed_at: new Date().toISOString(),
  };
}
