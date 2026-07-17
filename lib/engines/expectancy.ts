/**
 * In-sample forward expectancy from historical bars for the active setup mode.
 * Not a full walk-forward backtest — a same-symbol proxy of 20d/60d outcomes
 * after similar technical conditions.
 */

import type { OHLCVBar } from "@/lib/data/types";
import type { TradeMode } from "./trade-mode";

export interface ExpectancyReport {
  samples: number;
  hit_rate_20d: number;
  hit_rate_60d: number;
  avg_ret_20d: number;
  avg_ret_60d: number;
  expectancy_20d: number;
  mode: TradeMode;
  method: string;
  note: string;
}

function fwdReturn(closes: number[], i: number, days: number): number | null {
  const j = i + days;
  if (j >= closes.length) return null;
  if (closes[i] <= 0) return null;
  return ((closes[j] - closes[i]) / closes[i]) * 100;
}

function matchesMode(
  mode: TradeMode,
  closes: number[],
  vols: number[],
  i: number,
): boolean {
  if (i < 60) return false;
  const price = closes[i];
  const sma20 = closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
  const ret15 = ((price - closes[i - 15]) / closes[i - 15]) * 100;
  const vol20 = vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
  const vol60 = vols.slice(i - 59, i + 1).reduce((a, b) => a + b, 0) / 60;
  const volOk = vol20 > vol60 * 1.1;

  if (mode === "trend") {
    return price > sma20 && sma20 > sma50 && ret15 > 3 && volOk;
  }
  if (mode === "accumulate") {
    // Flat/down price with rising participation proxy
    return ret15 <= 2 && ret15 >= -8 && price <= sma20 * 1.02 && volOk;
  }
  // Generic constructive
  return price > sma50 && volOk && ret15 > -5 && ret15 < 12;
}

export function computeSignalExpectancy(
  bars: OHLCVBar[],
  mode: TradeMode,
): ExpectancyReport {
  const empty: ExpectancyReport = {
    samples: 0,
    hit_rate_20d: 0,
    hit_rate_60d: 0,
    avg_ret_20d: 0,
    avg_ret_60d: 0,
    expectancy_20d: 0,
    mode,
    method: "historical_condition_match",
    note: "Need ≥120 bars for expectancy proxy.",
  };
  if (bars.length < 120) return empty;

  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const rets20: number[] = [];
  const rets60: number[] = [];

  // Sample every 5th bar to reduce overlap bias
  const end = bars.length - 65;
  for (let i = 60; i < end; i += 5) {
    if (!matchesMode(mode === "none" ? "trend" : mode, closes, vols, i)) continue;
    const r20 = fwdReturn(closes, i, 20);
    const r60 = fwdReturn(closes, i, 60);
    if (r20 != null) rets20.push(r20);
    if (r60 != null) rets60.push(r60);
  }

  if (!rets20.length) {
    return {
      ...empty,
      note: "No historical analogues for this mode on this symbol.",
    };
  }

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const hit = (xs: number[]) => xs.filter((x) => x > 0).length / xs.length;
  const avg20 = avg(rets20);
  const avg60 = rets60.length ? avg(rets60) : 0;
  const hit20 = hit(rets20);
  const hit60 = rets60.length ? hit(rets60) : 0;

  // Crude expectancy proxy: hit*avg_win + (1-hit)*avg_loss ≈ mean return
  return {
    samples: rets20.length,
    hit_rate_20d: Math.round(hit20 * 1000) / 10,
    hit_rate_60d: Math.round(hit60 * 1000) / 10,
    avg_ret_20d: Math.round(avg20 * 100) / 100,
    avg_ret_60d: Math.round(avg60 * 100) / 100,
    expectancy_20d: Math.round(avg20 * 100) / 100,
    mode,
    method: "historical_condition_match",
    note:
      rets20.length < 8
        ? "Low sample — treat as directional hint only."
        : `Same-symbol analogues (mode=${mode || "generic"}), non-overlapping sample step=5.`,
  };
}
