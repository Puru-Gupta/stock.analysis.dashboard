/**
 * Trade mode split + explicit exit / time-stop plan.
 * Trend-follow and Accumulate-on-dip are incompatible edges — pick one primary.
 */

import type { OHLCVBar } from "@/lib/data/types";

export type TradeMode = "trend" | "accumulate" | "none";

export interface TradeModeResult {
  mode: TradeMode;
  label: string;
  reason: string;
  conflicting: boolean;
}

export function detectTradeMode(input: {
  active_setups: string[];
  trend: string;
  rsi: number;
  near_52w_high?: boolean;
  ret_3m?: number;
  obv_divergence?: boolean;
  bb_oversold?: boolean;
}): TradeModeResult {
  const setups = input.active_setups || [];
  const trendSetups = ["mvrb_momentum", "adx_ema_trend", "macd_cross", "bb_squeeze_breakout"];
  const accumSetups = ["obv_accumulation", "volume_breakout_setup"];

  const hasTrend = trendSetups.some((s) => setups.includes(s)) ||
    (input.trend === "uptrend" && (input.near_52w_high || (input.ret_3m ?? 0) > 12) && input.rsi >= 50 && input.rsi <= 70);
  const hasAccum =
    accumSetups.some((s) => setups.includes(s)) ||
    (!!input.obv_divergence && input.rsi < 50) ||
    (!!input.bb_oversold && input.trend !== "downtrend");

  if (hasTrend && hasAccum) {
    // Prefer accumulate when price is not chasing highs; else trend
    if (input.near_52w_high || (input.ret_3m ?? 0) > 15) {
      return {
        mode: "trend",
        label: "Trend follow",
        reason: "Momentum/52w-high edge dominates — ignore conflicting dip signals for entry timing.",
        conflicting: true,
      };
    }
    return {
      mode: "accumulate",
      label: "Accumulate on dip",
      reason: "OBV/consolidation edge dominates — do not chase momentum until breakout confirms.",
      conflicting: true,
    };
  }
  if (hasTrend) {
    return {
      mode: "trend",
      label: "Trend follow",
      reason: "Primary edge is momentum / EMA-ADX continuation.",
      conflicting: false,
    };
  }
  if (hasAccum) {
    return {
      mode: "accumulate",
      label: "Accumulate on dip",
      reason: "Primary edge is stealth accumulation / pre-breakout.",
      conflicting: false,
    };
  }
  return {
    mode: "none",
    label: "No clear mode",
    reason: "Neither trend nor accumulation edge is active.",
    conflicting: false,
  };
}

export interface ExitPlan {
  rules: string[];
  time_stop_days: number;
  trail_stop_hint: string;
  reduce_if: string[];
  invalidation: string;
}

export function buildExitPlan(opts: {
  mode: TradeMode;
  stop_loss: number;
  support: number;
  current_price: number;
  atr: number;
  horizon?: string;
  invalidation?: string;
}): ExitPlan {
  const { mode, stop_loss, support, current_price, atr } = opts;
  const swingFloor = Math.min(stop_loss, support > 0 ? support : stop_loss);
  const time_stop_days =
    mode === "accumulate" ? 30 : mode === "trend" ? 45 : 21;

  const rules: string[] = [
    `Hard stop: daily close below ₹${swingFloor} (structural invalidation).`,
    `Time stop: exit or re-underwrite if thesis not working within ${time_stop_days} trading days.`,
  ];

  if (mode === "trend") {
    rules.push("Trail: exit on close below EMA20 after a +1.5R move.");
    rules.push("Momentum fail: cut if RS vs Nifty drops below 0.9 for 5 consecutive sessions.");
  } else if (mode === "accumulate") {
    rules.push("Breakout fail: if no close above recent consolidation high within 15 sessions, exit.");
    rules.push(`Partial: take 1/3 off near +1R (~₹${Math.round((current_price + Math.max(atr, current_price * 0.02)) * 100) / 100}).`);
  } else {
    rules.push("Default: respect hard stop; do not average down without a new full re-score.");
  }

  const reduce_if = [
    "Fundamental score falls below 50 on refresh",
    "Index regime flips to risk-off — trim to half or flat",
    "RSI > 75 after entry without a pullback hold",
  ];

  return {
    rules,
    time_stop_days,
    trail_stop_hint:
      mode === "trend"
        ? "Trail under EMA20 / prior swing low"
        : "Hold through noise until breakout or time stop",
    reduce_if,
    invalidation: opts.invalidation || `Close below ₹${swingFloor}`,
  };
}

/** Simple swing-low proxy from recent bars for exit geometry. */
export function recentSwingLow(bars: OHLCVBar[], lookback = 20): number {
  if (!bars.length) return 0;
  const slice = bars.slice(-lookback);
  return Math.round(Math.min(...slice.map((b) => b.low)) * 100) / 100;
}
