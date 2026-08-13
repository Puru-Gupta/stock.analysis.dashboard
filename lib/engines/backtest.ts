import { ensureHistoryDepth, getPriceHistory } from "@/lib/data/sync";
import type { OHLCVBar } from "@/lib/data/types";
import { INDEX_SYMBOL, SECTORS, UNIVERSES } from "@/lib/data/universes";
import { ATR_STOP_MULTIPLIER, lookbackMonthsToDays, parseLookbackMonths, type LookbackMonths } from "@/lib/rebalancing-constants";
import { trailingAtrStop } from "./rebalancing";
import { computeAtr, computeTechnicalScores } from "./technical";

const REBALANCE_EVERY = 21;
const MAX_PICKS = 10;
const MAX_PER_SECTOR = 2;
const MIN_TECH = 55;

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
  monthly_capital: number;
  start_date: string;
  end_date: string;
  total_return_pct: number;
  benchmark_return_pct: number;
  max_drawdown_pct: number;
  rebalance_count: number;
  stop_out_count: number;
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

function sectorOf(symbol: string): string {
  for (const [key, syms] of Object.entries(SECTORS)) {
    if (syms.includes(symbol)) return key;
  }
  return "Other";
}

function diversifySymbols(ranked: { symbol: string; score: number }[]): string[] {
  const out: string[] = [];
  const sectorCount: Record<string, number> = {};
  for (const row of ranked) {
    const sec = sectorOf(row.symbol);
    if ((sectorCount[sec] || 0) >= MAX_PER_SECTOR) continue;
    out.push(row.symbol);
    sectorCount[sec] = (sectorCount[sec] || 0) + 1;
    if (out.length >= MAX_PICKS) break;
  }
  return out;
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

export async function runRebalanceBacktest(opts: {
  universe?: string;
  lookback_months?: number;
  monthly_capital?: number;
}): Promise<BacktestResult> {
  const universe = opts.universe || "nifty50";
  const lookback_months = parseLookbackMonths(opts.lookback_months);
  const monthly_capital = opts.monthly_capital || 100_000;
  const days = lookbackMonthsToDays(lookback_months);
  const symbols = (UNIVERSES[universe] || UNIVERSES.nifty50).slice(0, universe === "nifty50" ? 50 : 80);

  await ensureHistoryDepth(INDEX_SYMBOL, days);
  const { bars: niftyBars } = await getPriceHistory(INDEX_SYMBOL, days);
  if (niftyBars.length < REBALANCE_EVERY * 3) {
    throw new Error("Insufficient index history for backtest — ensure Supabase has price data synced.");
  }

  const histories = await loadHistories(symbols, days);
  const warmup = Math.min(200, Math.floor(niftyBars.length * 0.15));
  const simStart = warmup;
  const simBars = niftyBars.slice(simStart);

  let cash = monthly_capital;
  let positions: SimPosition[] = [];
  let peakNav = monthly_capital;
  let maxDrawdown = 0;
  let rebalanceCount = 0;
  let stopOutCount = 0;
  let closedWins = 0;
  let closedTotal = 0;

  const curve: BacktestPoint[] = [];
  const benchStart = simBars[0].close;

  for (let i = 0; i < simBars.length; i++) {
    const date = simBars[i].date;
    const niftySlice = sliceToDate(niftyBars, date);

    // Daily stop checks
    const nextPositions: SimPosition[] = [];
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
      nextPositions.push({ ...pos, peak, atr });
    }
    positions = nextPositions;

    // Monthly rebalance
    if (i % REBALANCE_EVERY === 0 && niftySlice.length >= 66) {
      rebalanceCount++;
      const ranked: { symbol: string; score: number }[] = [];
      for (const sym of symbols) {
        const bars = histories.get(sym);
        if (!bars) continue;
        const slice = sliceToDate(bars, date);
        if (slice.length < 66) continue;
        const niftyHist = sliceToDate(niftyBars, date);
        const tech = computeTechnicalScores(slice, niftyHist);
        if (tech.technical_score < MIN_TECH || tech.trend === "downtrend") continue;
        ranked.push({ symbol: sym, score: tech.technical_score });
      }
      ranked.sort((a, b) => b.score - a.score);
      const picks = diversifySymbols(ranked);

      // Mark portfolio to cash for rebalance (simplified: sell all, redeploy)
      for (const pos of positions) {
        const px = priceOn(histories.get(pos.symbol)!, date) ?? pos.entry;
        cash += px * pos.qty;
        closedTotal++;
        if (px > pos.entry) closedWins++;
      }
      positions = [];

      if (picks.length) {
        const invVol = picks.map((sym) => {
          const slice = sliceToDate(histories.get(sym)!, date);
          const atr = computeAtr(slice) || 1;
          const px = slice.at(-1)!.close;
          return { sym, w: 1 / Math.max(0.008, atr / px) };
        });
        const wSum = invVol.reduce((a, b) => a + b.w, 0);
        const deploy = cash;
        cash = 0;
        for (const row of invVol) {
          const wt = row.w / wSum;
          const amount = deploy * wt;
          const slice = sliceToDate(histories.get(row.sym)!, date);
          const px = slice.at(-1)!.close;
          const atr = computeAtr(slice) || px * 0.02;
          const qty = Math.max(1, Math.floor(amount / px));
          const spent = qty * px;
          cash += amount - spent;
          positions.push({
            symbol: row.sym,
            qty,
            entry: px,
            fixedStop: r2(Math.max(0, px - atr * ATR_STOP_MULTIPLIER)),
            peak: px,
            atr,
          });
        }
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
    monthly_capital,
    start_date: simBars[0]?.date ?? "",
    end_date: simBars.at(-1)?.date ?? "",
    total_return_pct: r2(((finalNav - monthly_capital) / monthly_capital) * 100),
    benchmark_return_pct: r2(((benchFinal - monthly_capital) / monthly_capital) * 100),
    max_drawdown_pct: r2(maxDrawdown),
    rebalance_count: rebalanceCount,
    stop_out_count: stopOutCount,
    win_rate_pct: closedTotal > 0 ? r2((closedWins / closedTotal) * 100) : 0,
    equity_curve: curve,
    note: `Technical-only walk-forward backtest (${lookback_months}mo window). Rebalances every ~${REBALANCE_EVERY} sessions with trailing ATR stops. Fundamentals not replayed historically — use as a rough sanity check, not PM-grade validation.`,
    analyzed_at: new Date().toISOString(),
  };
}
