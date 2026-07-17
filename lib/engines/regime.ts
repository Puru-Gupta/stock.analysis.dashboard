/**
 * Index regime gate — block fresh cash Buys when Nifty is risk-off.
 * Uses EMA50 / EMA200 stack + 20-session return (no VIX dependency).
 */

import type { OHLCVBar } from "@/lib/data/types";
import { computeEma } from "./strategies";

export type RegimeState = "risk_on" | "neutral" | "risk_off";

export interface IndexRegime {
  state: RegimeState;
  allows_long: boolean;
  nifty_last: number;
  ema50: number;
  ema200: number;
  ret_20d: number;
  price_above_ema50: boolean;
  ema_stack_bull: boolean;
  label: string;
  detail: string;
}

export function evaluateIndexRegime(niftyBars: OHLCVBar[]): IndexRegime {
  const empty: IndexRegime = {
    state: "neutral",
    allows_long: true,
    nifty_last: 0,
    ema50: 0,
    ema200: 0,
    ret_20d: 0,
    price_above_ema50: true,
    ema_stack_bull: false,
    label: "Regime unknown",
    detail: "Insufficient Nifty history — long gate not applied.",
  };
  if (!niftyBars.length || niftyBars.length < 60) return empty;

  const closes = niftyBars.map((b) => b.close);
  const ema50Series = computeEma(closes, 50);
  const ema200Series = computeEma(closes, Math.min(200, closes.length));
  const last = closes.at(-1)!;
  const ema50 = ema50Series.at(-1)!;
  const ema200 = ema200Series.at(-1)!;
  const lookback = Math.min(20, closes.length - 1);
  const ret_20d = Math.round(((last - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 1000) / 10;
  const price_above_ema50 = last > ema50;
  const ema_stack_bull = last > ema50 && ema50 > ema200;

  let state: RegimeState = "neutral";
  if (ema_stack_bull && ret_20d >= 0) {
    state = "risk_on";
  } else if ((!price_above_ema50 && last < ema200) || ret_20d <= -5 || (last < ema50 && ema50 < ema200 && ret_20d < 0)) {
    state = "risk_off";
  }

  // Fresh cash Buys only in risk_on, or neutral with price above EMA50
  const allows_long = state === "risk_on" || (state === "neutral" && price_above_ema50);

  const label =
    state === "risk_on" ? "Risk-on" : state === "risk_off" ? "Risk-off" : "Neutral";
  const detail =
    state === "risk_on"
      ? `Nifty above EMA50/200 stack, 20d ${ret_20d}% — cash Buys allowed.`
      : state === "risk_off"
        ? `Nifty risk-off (20d ${ret_20d}%, below trend EMAs) — fresh cash Buys blocked.`
        : price_above_ema50
          ? `Neutral regime but Nifty above EMA50 — cautious Buys allowed.`
          : `Neutral/soft — Nifty below EMA50; fresh Buys blocked.`;

  return {
    state,
    allows_long,
    nifty_last: Math.round(last * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    ema200: Math.round(ema200 * 100) / 100,
    ret_20d,
    price_above_ema50,
    ema_stack_bull,
    label,
    detail,
  };
}
