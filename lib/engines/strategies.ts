/**
 * Strategy primitives inspired by public systematic-trading patterns:
 * - MACD / EMA trend (je-suis-tm/quant-trading, marketcalls/pyindicators)
 * - ADX trend strength (Ajay-Maury/RSI-bot Indian equity filters)
 * - Bollinger mean-reversion / squeeze (Algo-Trade multi-factor)
 * - Multi-indicator vote ≥ N (rehaniranii/Algo-Trade style confluence)
 *
 * These are confirmation layers — they do NOT loosen Buy/Sell thresholds.
 */

import type { OHLCVBar } from "@/lib/data/types";

function rollingMean(arr: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) {
      out.push(NaN);
      continue;
    }
    const slice = arr.slice(i - window + 1, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / window);
  }
  return out;
}

function rollingStd(arr: number[], window: number): number[] {
  const means = rollingMean(arr, window);
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) {
      out.push(NaN);
      continue;
    }
    const slice = arr.slice(i - window + 1, i + 1);
    const mean = means[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / window;
    out.push(Math.sqrt(variance));
  }
  return out;
}

export function computeEma(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let ema = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(values[i]);
      ema = values[i];
      continue;
    }
    if (i < period - 1) {
      // seed with SMA until enough samples
      const seed = values.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
      ema = seed;
      out.push(seed);
      continue;
    }
    if (i === period - 1) {
      ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out.push(ema);
      continue;
    }
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

/** Classic MACD(12,26,9) */
export function computeMacd(closes: number[]) {
  const ema12 = computeEma(closes, 12);
  const ema26 = computeEma(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalLine = computeEma(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  const i = closes.length - 1;
  const prev = Math.max(0, i - 1);
  return {
    macd: macdLine[i] ?? 0,
    signal: signalLine[i] ?? 0,
    hist: hist[i] ?? 0,
    bullish_cross: macdLine[prev] <= signalLine[prev] && macdLine[i] > signalLine[i],
    bearish_cross: macdLine[prev] >= signalLine[prev] && macdLine[i] < signalLine[i],
    above_signal: (macdLine[i] ?? 0) > (signalLine[i] ?? 0),
    hist_rising: (hist[i] ?? 0) > (hist[prev] ?? 0),
  };
}

/** Simplified ADX(14) — trend strength filter from RSI-bot / CTA literature */
export function computeAdx(bars: OHLCVBar[], period = 14): { adx: number; plus_di: number; minus_di: number; trending: boolean } {
  if (bars.length < period + 2) return { adx: 20, plus_di: 0, minus_di: 0, trending: false };

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }

  const smooth = (arr: number[], n: number) => {
    let prev = arr.slice(0, n).reduce((a, b) => a + b, 0);
    const out = [prev];
    for (let i = n; i < arr.length; i++) {
      prev = prev - prev / n + arr[i];
      out.push(prev);
    }
    return out;
  };

  if (tr.length < period) return { adx: 20, plus_di: 0, minus_di: 0, trending: false };

  const str = smooth(tr, period);
  const sp = smooth(plusDM, period);
  const sm = smooth(minusDM, period);
  const dx: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const atr = str[i] || 1;
    const pdi = (100 * sp[i]) / atr;
    const mdi = (100 * sm[i]) / atr;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }
  const adxSeries = smooth(dx, period);
  const adx = Math.round((adxSeries.at(-1) ?? 20) * 10) / 10;
  const atrLast = str.at(-1) || 1;
  const plus_di = Math.round(((100 * (sp.at(-1) || 0)) / atrLast) * 10) / 10;
  const minus_di = Math.round(((100 * (sm.at(-1) || 0)) / atrLast) * 10) / 10;
  return { adx, plus_di, minus_di, trending: adx >= 25 };
}

export function computeBollinger(closes: number[], period = 20, mult = 2) {
  const mid = rollingMean(closes, period);
  const std = rollingStd(closes, period);
  const i = closes.length - 1;
  const m = mid[i];
  const s = std[i] || 0;
  const upper = m + mult * s;
  const lower = m - mult * s;
  const width = m ? ((upper - lower) / m) * 100 : 0;
  const pctB = upper !== lower ? (closes[i] - lower) / (upper - lower) : 0.5;
  return {
    mid: m,
    upper,
    lower,
    width: Math.round(width * 100) / 100,
    pct_b: Math.round(pctB * 1000) / 1000,
    squeeze: width > 0 && width < 8,
    overbought: pctB >= 0.95,
    oversold: pctB <= 0.05,
  };
}

export interface StrategyConfluence {
  votes_bull: number;
  votes_bear: number;
  factors: string[];
  macd: ReturnType<typeof computeMacd>;
  adx: ReturnType<typeof computeAdx>;
  bollinger: ReturnType<typeof computeBollinger>;
  ema_stack_bull: boolean;
  ema_stack_bear: boolean;
  /** True when ≥3 bullish factors align (Algo-Trade style) */
  bullish_confluence: boolean;
  bearish_confluence: boolean;
}

/**
 * Multi-factor confluence vote. Buy path in combineDecision requires this
 * for non-Strong-Buy entries — never used alone to force a Buy.
 */
export function evaluateStrategyConfluence(bars: OHLCVBar[]): StrategyConfluence {
  const closes = bars.map((b) => b.close);
  const macd = computeMacd(closes);
  const adx = computeAdx(bars);
  const bollinger = computeBollinger(closes);
  const ema20 = computeEma(closes, 20);
  const ema50 = computeEma(closes, 50);
  const price = closes.at(-1)!;
  const e20 = ema20.at(-1)!;
  const e50 = ema50.at(-1)!;
  const ema_stack_bull = price > e20 && e20 > e50;
  const ema_stack_bear = price < e20 && e20 < e50;

  const factors: string[] = [];
  let votes_bull = 0;
  let votes_bear = 0;

  if (macd.above_signal && macd.hist_rising) {
    votes_bull++;
    factors.push("MACD above signal & rising histogram");
  } else if (macd.bullish_cross) {
    votes_bull++;
    factors.push("MACD bullish crossover");
  }
  if (macd.bearish_cross || (!macd.above_signal && !macd.hist_rising)) {
    if (macd.bearish_cross || (macd.hist < 0 && !macd.hist_rising)) {
      votes_bear++;
      if (macd.bearish_cross) factors.push("MACD bearish crossover");
    }
  }

  if (adx.trending && adx.plus_di > adx.minus_di) {
    votes_bull++;
    factors.push(`ADX ${adx.adx} trending (+DI > −DI)`);
  } else if (adx.trending && adx.minus_di > adx.plus_di) {
    votes_bear++;
    factors.push(`ADX ${adx.adx} trending (−DI > +DI)`);
  }

  if (ema_stack_bull) {
    votes_bull++;
    factors.push("EMA stack bullish (price > EMA20 > EMA50)");
  } else if (ema_stack_bear) {
    votes_bear++;
    factors.push("EMA stack bearish (price < EMA20 < EMA50)");
  }

  if (bollinger.oversold && !bollinger.overbought) {
    votes_bull++;
    factors.push("Bollinger oversold / mean-reversion long bias");
  } else if (bollinger.overbought) {
    votes_bear++;
    factors.push("Bollinger overbought — chase risk");
  }

  if (bollinger.squeeze && macd.hist_rising && ema_stack_bull) {
    votes_bull++;
    factors.push("BB squeeze + MACD rising in uptrend (breakout setup)");
  }

  return {
    votes_bull,
    votes_bear,
    factors,
    macd,
    adx,
    bollinger,
    ema_stack_bull,
    ema_stack_bear,
    bullish_confluence: votes_bull >= 3,
    bearish_confluence: votes_bear >= 3,
  };
}
