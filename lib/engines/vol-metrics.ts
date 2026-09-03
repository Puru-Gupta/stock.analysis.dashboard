import type { OHLCVBar } from "@/lib/data/types";

function r2(n: number) {
  return Math.round(n * 10000) / 10000;
}

/** Close-to-close realized vol (annualized). */
export function closeToCloseVol(bars: { close: number }[], window = 20): number {
  if (bars.length < window + 1) return 0.2;
  const rets: number[] = [];
  const slice = bars.slice(-window - 1);
  for (let i = 1; i < slice.length; i++) {
    const p0 = slice[i - 1].close;
    const p1 = slice[i].close;
    if (p0 > 0 && p1 > 0) rets.push(Math.log(p1 / p0));
  }
  if (rets.length < 5) return 0.2;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Parkinson high-low estimator (annualized). Uses intraday range — better for option sellers. */
export function parkinsonVol(bars: OHLCVBar[], window = 20): number {
  if (bars.length < window) return closeToCloseVol(bars, window);
  const slice = bars.slice(-window);
  let sum = 0;
  let n = 0;
  for (const b of slice) {
    if (b.high > 0 && b.low > 0 && b.high >= b.low) {
      const hl = Math.log(b.high / b.low);
      sum += hl * hl;
      n++;
    }
  }
  if (n < 5) return closeToCloseVol(bars, window);
  const factor = 1 / (4 * n * Math.LN2);
  return Math.sqrt(sum * factor) * Math.sqrt(252);
}

/** Garman–Klass OHLC estimator (annualized). */
export function garmanKlassVol(bars: OHLCVBar[], window = 20): number {
  if (bars.length < window) return parkinsonVol(bars, window);
  const slice = bars.slice(-window);
  let sum = 0;
  let n = 0;
  for (const b of slice) {
    if (b.high > 0 && b.low > 0 && b.open > 0 && b.close > 0) {
      const hl = Math.log(b.high / b.low) ** 2;
      const co = Math.log(b.close / b.open) ** 2;
      sum += 0.5 * hl - (2 * Math.LN2 - 1) * co;
      n++;
    }
  }
  if (n < 5) return parkinsonVol(bars, window);
  return Math.sqrt(Math.max(sum / n, 0)) * Math.sqrt(252);
}

export interface VolComparison {
  hv_close: number;
  hv_parkinson: number;
  hv_gk: number;
  iv_hv_gk_ratio: number | null;
  range_rich: boolean;
}

export function compareVolMetrics(bars: OHLCVBar[], impliedVol: number | null, ivIsProxy: boolean): VolComparison {
  const hv_close = closeToCloseVol(bars, 20);
  const hv_parkinson = parkinsonVol(bars, 20);
  const hv_gk = garmanKlassVol(bars, 20);
  const iv = impliedVol && !ivIsProxy ? impliedVol : null;
  const iv_hv_gk_ratio = iv && hv_gk > 0 ? r2(iv / hv_gk) : null;
  const range_rich = iv_hv_gk_ratio != null ? iv_hv_gk_ratio > 1.1 : hv_parkinson > hv_close * 1.08;
  return { hv_close, hv_parkinson, hv_gk, iv_hv_gk_ratio, range_rich };
}
