import type { VolRegime } from "./option-stats";

export type StrategySide = "put" | "call" | "both" | "na";

export interface OptionStrategyPick {
  recommended_strategy: string;
  strategy_note: string;
  /** Which option side the primary leg uses; "both" = strangle/condor */
  strategy_side: StrategySide;
}

/**
 * Suggest the best option structure for a scan row (seller-first; respects call/put tab).
 */
export function pickBestOptionStrategy(input: {
  optionType: "call" | "put";
  regime: VolRegime | string;
  trendLabel: string;
  z1m: number;
  ivRank: number;
  ivHvRatio: number;
  focusStatus: "clean" | "caution" | "avoid";
  sellerVolScore: number;
  quantScore?: number;
  empiricalPop?: number | null;
  liveIv?: boolean;
}): OptionStrategyPick {
  const {
    optionType,
    regime,
    trendLabel,
    z1m,
    ivRank,
    ivHvRatio,
    focusStatus,
    sellerVolScore,
    quantScore,
    empiricalPop,
    liveIv,
  } = input;

  const absZ = Math.abs(z1m);
  const quiet = regime === "Quiet" || regime === "Very Quiet";
  const hot = regime === "Elevated" || regime === "High" || regime === "Extreme";
  const sideways = trendLabel === "Sideways";
  const richIv = !liveIv ? ivRank >= 45 : ivHvRatio >= 1.08 && ivRank >= 40;
  const cheapIv = ivRank <= 35 && ivHvRatio <= 1.02;

  if (focusStatus === "avoid") {
    return {
      recommended_strategy: "Wait",
      strategy_note: "Earnings/news risk — skip fresh premium sales.",
      strategy_side: "na",
    };
  }

  if (sellerVolScore < 35 || (quantScore != null && quantScore < 40)) {
    return {
      recommended_strategy: "Wait",
      strategy_note: "Weak vol edge — no compelling sell setup today.",
      strategy_side: "na",
    };
  }

  // Stretched + caution → defined-risk only (Hero MotoCorp lesson)
  if (focusStatus === "caution" || absZ >= 1.5) {
    if (quiet && sideways && absZ < 2.2) {
      return {
        recommended_strategy: "Iron Condor",
        strategy_note: `Price ${z1m > 0 ? "+" : ""}${z1m.toFixed(1)}σ stretched — use wings, not tight strangle.`,
        strategy_side: "both",
      };
    }
    if (optionType === "put" && z1m < -1.2) {
      return {
        recommended_strategy: "Bull Put Spread",
        strategy_note: "Stretched down — sell put spread, not naked short put.",
        strategy_side: "put",
      };
    }
    if (optionType === "call" && z1m > 1.2) {
      return {
        recommended_strategy: "Bear Call Spread",
        strategy_note: "Stretched up — sell call spread above resistance.",
        strategy_side: "call",
      };
    }
    return {
      recommended_strategy: "Iron Condor",
      strategy_note: "Elevated stretch — defined risk only; widen strikes.",
      strategy_side: "both",
    };
  }

  // Ideal short-vol range book
  if (quiet && sideways && absZ < 1.2 && focusStatus === "clean") {
    if (richIv && (empiricalPop == null || empiricalPop >= 70)) {
      return {
        recommended_strategy: "Short Strangle",
        strategy_note: "Quiet, mean-centered, rich IV — classic weekly strangle if wings ≥1.5σ.",
        strategy_side: "both",
      };
    }
    return {
      recommended_strategy: "Iron Condor",
      strategy_note: "Quiet range — iron condor safer than tight strangle when IV is modest.",
      strategy_side: "both",
    };
  }

  if (quiet && absZ < 1) {
    return {
      recommended_strategy: "Iron Condor",
      strategy_note: "Low realized vol — collect premium inside expected move with wings.",
      strategy_side: "both",
    };
  }

  // Directional premium selling
  if (optionType === "put" && (trendLabel === "Bullish" || z1m > 0.5)) {
    return {
      recommended_strategy: richIv ? "Cash-Secured Put" : "Bull Put Spread",
      strategy_note: "Bullish bias — sell OTM puts below support; spread if IV is thin.",
      strategy_side: "put",
    };
  }

  if (optionType === "call" && (trendLabel === "Bearish" || z1m < -0.5)) {
    return {
      recommended_strategy: richIv ? "Sell OTM Call" : "Bear Call Spread",
      strategy_note: "Bearish bias — sell OTM calls; spread if premium is low.",
      strategy_side: "call",
    };
  }

  if (hot && richIv) {
    return {
      recommended_strategy: optionType === "put" ? "Bull Put Spread" : "Bear Call Spread",
      strategy_note: `${regime} vol — sell spreads; size down per India VIX.`,
      strategy_side: optionType,
    };
  }

  if (cheapIv) {
    return {
      recommended_strategy: "Wait",
      strategy_note: "IV rank low — premiums thin; wait for richer vol or use spreads only.",
      strategy_side: "na",
    };
  }

  return {
    recommended_strategy: optionType === "put" ? "Bull Put Spread" : "Bear Call Spread",
    strategy_note: "Selective credit spread — confirm live chain before entry.",
    strategy_side: optionType,
  };
}
