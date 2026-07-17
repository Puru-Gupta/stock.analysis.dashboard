import type { OHLCVBar } from "@/lib/data/types";
import { evaluateStrategyConfluence } from "./strategies";

export function rollingMean(arr: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) { out.push(NaN); continue; }
    const slice = arr.slice(i - window + 1, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / window);
  }
  return out;
}

export function rollingStd(arr: number[], window: number): number[] {
  const means = rollingMean(arr, window);
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) { out.push(NaN); continue; }
    const slice = arr.slice(i - window + 1, i + 1);
    const mean = means[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / window;
    out.push(Math.sqrt(variance));
  }
  return out;
}

export function computeObv(bars: OHLCVBar[]): number[] {
  const obv = [0];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv.push(obv[i - 1] + bars[i].volume);
    else if (bars[i].close < bars[i - 1].close) obv.push(obv[i - 1] - bars[i].volume);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

export function findSupportResistance(bars: OHLCVBar[], lookback = 60) {
  const recent = bars.slice(-lookback);
  // Use 10th / 90th percentile-ish via sorted extremes to reduce outlier stops
  const lows = [...recent.map((b) => b.low)].sort((a, b) => a - b);
  const highs = [...recent.map((b) => b.high)].sort((a, b) => a - b);
  const li = Math.max(0, Math.floor(lows.length * 0.1));
  const hi = Math.min(highs.length - 1, Math.floor(highs.length * 0.9));
  return {
    support: lows[li],
    resistance: highs[hi],
  };
}

export function detectTrend(bars: OHLCVBar[]): string {
  if (bars.length < 30) return "neutral";
  const closes = bars.map((b) => b.close);
  const sma = (n: number) => closes.slice(-n).reduce((a, b) => a + b, 0) / n;
  const sma20 = sma(20);
  const sma50 = bars.length >= 50 ? sma(50) : sma20;
  const price = closes[closes.length - 1];
  const highs = bars.slice(-10).map((b) => b.high);
  const lows = bars.slice(-10).map((b) => b.low);
  const count = (arr: number[], fn: (a: number, b: number) => boolean) =>
    arr.slice(1).filter((v, i) => fn(v, arr[i])).length;
  const hh = count(highs, (a, b) => a > b);
  const hl = count(lows, (a, b) => a > b);
  const lh = count(highs, (a, b) => a < b);
  const ll = count(lows, (a, b) => a < b);
  if (price > sma20 && sma20 > sma50 && hh >= 4 && hl >= 4) return "uptrend";
  if (price < sma20 && sma20 < sma50 && lh >= 4 && ll >= 4) return "downtrend";
  return "neutral";
}

export function computeAtr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < period + 1) {
    const closes = bars.map((b) => b.close);
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((s, v) => s + (v - mean) ** 2, 0) / closes.length;
    return Math.sqrt(variance) * 0.02;
  }
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing for ATR
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/** True Wilder RSI(14) */
export function computeRsi(bars: OHLCVBar[], period = 14): number {
  if (bars.length < period + 1) return 50;
  const closes = bars.map((b) => b.close);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

export function mvrbMetrics(bars: OHLCVBar[], niftyBars: OHLCVBar[]) {
  if (bars.length < 22) return null;
  const price = bars[bars.length - 1].close;
  const price1m = bars[bars.length - 22].close;
  const lookback3m = Math.min(bars.length - 1, 66);
  const price3m = bars[bars.length - 1 - lookback3m].close;
  const ret1m = ((price - price1m) / price1m) * 100;
  const ret3m = ((price - price3m) / price3m) * 100;
  const vols = bars.map((b) => b.volume);
  const volAvg = rollingMean(vols, 20).at(-1) || 1;
  const volRatio = bars[bars.length - 1].volume / volAvg;
  const maxPrice = Math.max(...bars.slice(-252).map((b) => b.close));
  let rs = 1;
  if (niftyBars.length >= lookback3m + 1) {
    const n0 = niftyBars[niftyBars.length - 1 - lookback3m].close;
    const n1 = niftyBars.at(-1)!.close;
    const niftyRet = ((n1 - n0) / n0) * 100;
    // Relative strength as excess return (stable when index ≈ flat)
    if (Math.abs(niftyRet) < 0.5) {
      rs = 1 + ret3m / 10;
    } else {
      rs = 1 + (ret3m - niftyRet) / Math.max(5, Math.abs(niftyRet));
    }
  }
  return {
    ret_1m: Math.round(ret1m * 100) / 100,
    ret_3m: Math.round(ret3m * 100) / 100,
    vol_ratio: Math.round(volRatio * 100) / 100,
    near_52w_high: price / maxPrice > 0.95,
    rs_vs_nifty: Math.round(rs * 100) / 100,
  };
}

export function accumulationBreakout(bars: OHLCVBar[]) {
  if (bars.length < 30) {
    return { signal: false, price_consolidation: false, volume_accumulation: false, near_20sma: false, pre_breakout: false };
  }
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const sma20 = rollingMean(closes, 20);
  const volSma = rollingMean(vols, 20);
  const std20 = rollingStd(closes, 20);
  const i = bars.length - 1;
  const bbWidth = 4 * (std20[i] || 0);
  const bbWidths = closes.map((_, idx) => 4 * (std20[idx] || 0));
  const bbWidthAvg = rollingMean(bbWidths, 20).at(-1) || bbWidth;
  const priceConsolidation = bbWidth < bbWidthAvg * 0.75;
  const volumeAccum = vols[i] > (volSma[i] || 0) * 1.5;
  const near20sma = Math.abs(closes[i] - (sma20[i] || closes[i])) / (sma20[i] || closes[i]) < 0.03;
  const notAtHigh = closes[i] < Math.max(...closes) * 0.95;
  const priceChg15d = closes[i] - closes[Math.max(0, i - 15)];
  const priceChgPct = (priceChg15d / closes[Math.max(0, i - 15)]) * 100;
  return {
    signal: priceConsolidation && volumeAccum && near20sma && notAtHigh,
    price_consolidation: priceConsolidation,
    volume_accumulation: volumeAccum,
    near_20sma: near20sma,
    pre_breakout: notAtHigh,
    bb_width: Math.round(bbWidth * 100) / 100,
    vol_vs_avg: Math.round((vols[i] / (volSma[i] || 1)) * 100) / 100,
    price_change_15d_pct: Math.round(priceChgPct * 100) / 100,
  };
}

export function obvAccumulation(bars: OHLCVBar[]) {
  if (bars.length < 60) {
    return { signal: false, obv_divergence: false, volume_spike: false, price_change_15d: 0, obv_change_15d: 0, price_down_flat: false };
  }
  const obv = computeObv(bars);
  const priceChange = bars.at(-1)!.close - bars.at(-15)!.close;
  const obvChange = obv.at(-1)! - obv.at(-15)!;
  const priceChgPct = (priceChange / bars.at(-15)!.close) * 100;
  const avg20 = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
  const avg60 = bars.slice(-60).reduce((s, b) => s + b.volume, 0) / 60;
  const volumeSpike = avg20 > 1.5 * avg60;
  const obvDivergence = obvChange > 0 && priceChange <= 0;
  const priceDownFlat = priceChgPct <= 2 && priceChgPct >= -8;
  // True accumulation requires divergence + flat/down price (not volume spike alone)
  return {
    signal: obvDivergence && priceDownFlat,
    obv_divergence: obvDivergence,
    volume_spike: volumeSpike,
    price_change_15d: Math.round(priceChange * 100) / 100,
    price_change_15d_pct: Math.round(priceChgPct * 100) / 100,
    obv_change_15d: Math.round(obvChange),
    price_down_flat: priceDownFlat,
    vol_20d_vs_60d: Math.round((avg20 / avg60) * 100) / 100,
  };
}

export function computeTechnicalScores(bars: OHLCVBar[], niftyBars: OHLCVBar[]) {
  const mvrb = mvrbMetrics(bars, niftyBars);
  const accum = accumulationBreakout(bars);
  const obv = obvAccumulation(bars);
  const trend = detectTrend(bars);
  const { support, resistance } = findSupportResistance(bars);
  const atr = computeAtr(bars);
  const rsi = computeRsi(bars);
  const price = bars.at(-1)!.close;
  const confluence = evaluateStrategyConfluence(bars);

  let trendScore = 50;
  if (trend === "uptrend") trendScore = 80;
  else if (trend === "downtrend") trendScore = 25;
  if (confluence.ema_stack_bull && trend === "uptrend") trendScore = Math.min(100, trendScore + 5);
  if (confluence.adx.trending && confluence.adx.plus_di > confluence.adx.minus_di) {
    trendScore = Math.min(100, trendScore + 5);
  }

  let momentumScore = 50;
  if (mvrb) {
    if (mvrb.ret_3m > 15) momentumScore = 85;
    else if (mvrb.ret_3m > 10) momentumScore = 75;
    else if (mvrb.ret_3m > 5) momentumScore = 65;
    else if (mvrb.ret_3m < -10) momentumScore = 20;
    else if (mvrb.ret_3m < -5) momentumScore = 30;
  }
  // RSI: constructive mid-trend is good; overbought is a penalty for new Buys
  if (rsi >= 50 && rsi <= 65) momentumScore = Math.min(100, momentumScore + 8);
  else if (rsi > 70) momentumScore = Math.max(0, momentumScore - 8);
  else if (rsi < 30) momentumScore = Math.max(0, momentumScore - 12);
  else if (rsi < 45) momentumScore = Math.max(0, momentumScore - 5);
  if (confluence.macd.above_signal && confluence.macd.hist_rising) {
    momentumScore = Math.min(100, momentumScore + 6);
  } else if (confluence.macd.bearish_cross) {
    momentumScore = Math.max(0, momentumScore - 8);
  }

  let volumeScore = 50;
  const volRatio = mvrb?.vol_ratio ?? 0;
  if (volRatio > 1.5) volumeScore = 85;
  else if (volRatio > 1.2) volumeScore = 70;
  else if (volRatio > 1.0) volumeScore = 60;
  else if (mvrb && volRatio < 0.7) volumeScore = 35;

  let srScore = 50;
  const distRes = ((resistance - price) / price) * 100;
  const distSup = ((price - support) / price) * 100;
  if (distRes < 2 && trend === "uptrend") srScore = 75;
  else if (distSup < 3 && trend === "uptrend") srScore = 70;
  if (confluence.bollinger.overbought) srScore = Math.max(0, srScore - 10);

  let rsScore = 50;
  if (mvrb) {
    if (mvrb.rs_vs_nifty > 1.2) rsScore = 85;
    else if (mvrb.rs_vs_nifty > 1.0) rsScore = 75;
    else if (mvrb.rs_vs_nifty > 0.9) rsScore = 65;
    else if (mvrb.rs_vs_nifty < 0.8) rsScore = 35;
  }

  // Bonus only for confirmed setups (OBV true divergence, not volume spike alone)
  let bonus = (accum.signal ? 10 : 0) + (obv.signal ? 8 : 0);
  if (mvrb?.near_52w_high && volRatio >= 1.2) bonus += 4; // chase only with volume
  if (confluence.bullish_confluence) bonus += 5;
  bonus = Math.min(bonus, 15);

  const technicalScore = Math.min(100, Math.max(0, Math.round(
    trendScore * 0.25 + momentumScore * 0.2 + volumeScore * 0.2 + srScore * 0.15 + rsScore * 0.2 + bonus * 0.6
  )));

  let entryLow: number, entryHigh: number, stopLoss: number, target1: number, target2: number;
  if (trend === "uptrend" && price > support) {
    entryLow = Math.round((price - atr * 0.3) * 100) / 100;
    entryHigh = Math.round((price + atr * 0.1) * 100) / 100;
    stopLoss = Math.round(Math.max(support - atr * 0.3, price - atr * 1.5) * 100) / 100;
    target1 = Math.round(Math.max(resistance, price + atr * 1.5) * 100) / 100;
    target2 = Math.round((price + atr * 2.5) * 100) / 100;
  } else if (trend === "downtrend") {
    entryLow = Math.round((price - atr * 0.2) * 100) / 100;
    entryHigh = price;
    stopLoss = Math.round(Math.min(resistance + atr * 0.3, price + atr * 1.5) * 100) / 100;
    target1 = Math.round(Math.min(support, price - atr * 1.5) * 100) / 100;
    target2 = Math.round((price - atr * 2.5) * 100) / 100;
  } else {
    entryLow = Math.round(support * 100) / 100;
    entryHigh = price;
    stopLoss = Math.round((support - atr * 0.5) * 100) / 100;
    target1 = Math.round(resistance * 100) / 100;
    target2 = Math.round(((price + resistance) / 2) * 100) / 100;
  }

  const risk = Math.abs(price - stopLoss);
  const reward = Math.abs(target1 - price);
  const signals: string[] = [];
  if (trend === "uptrend") signals.push("Price in uptrend with higher highs/lows");
  else if (trend === "downtrend") signals.push("Price in downtrend");
  if (rsi >= 50 && rsi <= 65) signals.push(`RSI constructive at ${rsi}`);
  else if (rsi > 70) signals.push(`RSI overbought at ${rsi} — avoid fresh longs`);
  else if (rsi < 30) signals.push(`RSI oversold at ${rsi}`);
  if (mvrb && mvrb.ret_3m > 10) signals.push(`Strong 3M momentum: ${mvrb.ret_3m}%`);
  if (mvrb && mvrb.vol_ratio > 1.2) signals.push(`Volume above average: ${mvrb.vol_ratio}x`);
  if (mvrb && mvrb.rs_vs_nifty > 1) signals.push(`Outperforming Nifty (RS: ${mvrb.rs_vs_nifty})`);
  if (mvrb?.near_52w_high) signals.push("Trading near 52-week high");
  if (accum.signal) signals.push("Consolidation with volume accumulation — potential breakout");
  if (obv.obv_divergence) {
    signals.push(
      `OBV rising (+${obv.obv_change_15d}) while price ${(obv.price_change_15d_pct ?? 0) <= 0 ? "down" : "flat"} (${obv.price_change_15d_pct ?? 0}%) — quiet accumulation`,
    );
  }
  if (obv.volume_spike && !obv.obv_divergence) {
    signals.push(`Volume spike: 20-day avg is ${obv.vol_20d_vs_60d}x of 60-day avg (needs price/OBV confirm)`);
  }
  for (const f of confluence.factors.slice(0, 4)) signals.push(f);

  const activeSetups: string[] = [];
  if (obv.obv_divergence && obv.price_down_flat) activeSetups.push("obv_accumulation");
  if (accum.signal) activeSetups.push("volume_breakout_setup");
  // Stricter MVRB setup: need real volume expansion
  if (mvrb && mvrb.ret_3m > 12 && mvrb.vol_ratio >= 1.3 && mvrb.rs_vs_nifty >= 1.0) {
    activeSetups.push("mvrb_momentum");
  }
  if (confluence.bullish_confluence && confluence.macd.bullish_cross) activeSetups.push("macd_cross");
  if (confluence.bullish_confluence && confluence.bollinger.squeeze) activeSetups.push("bb_squeeze_breakout");
  if (confluence.adx.trending && confluence.ema_stack_bull) activeSetups.push("adx_ema_trend");

  return {
    technical_score: technicalScore,
    trend,
    trend_score: trendScore,
    momentum_score: momentumScore,
    volume_score: volumeScore,
    sr_score: srScore,
    rs_score: rsScore,
    rsi,
    mvrb,
    accumulation: accum,
    obv,
    strategy_confluence: confluence,
    active_setups: activeSetups,
    support,
    resistance,
    atr: Math.round(atr * 100) / 100,
    current_price: price,
    entry_zone: [entryLow, entryHigh] as [number, number],
    stop_loss: stopLoss,
    target1,
    target2,
    risk_reward: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
    technical_signals: signals,
    invalidation: trend !== "downtrend" ? `Close below ₹${stopLoss}` : `Close above ₹${stopLoss}`,
  };
}
