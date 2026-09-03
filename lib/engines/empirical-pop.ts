import type { OHLCVBar } from "@/lib/data/types";
import { weeklyExpiryDates } from "./expiry-outliers";

function r1(n: number) {
  return Math.round(n * 10) / 10;
}

/**
 * Historical % of expiry windows where spot finished OTM vs strike
 * (weekly Thursday/Tuesday windows from expiry-outliers engine).
 */
export function empiricalOtmRate(
  bars: OHLCVBar[],
  strike: number,
  spot: number,
  optionType: "call" | "put",
  lookbackYears = 3,
): { rate_pct: number; samples: number; label: string } {
  if (bars.length < 120 || strike <= 0 || spot <= 0) {
    return { rate_pct: 50, samples: 0, label: "Insufficient history" };
  }

  const end = bars.at(-1)!.date;
  const startD = new Date(end);
  startD.setFullYear(startD.getFullYear() - lookbackYears);
  const start = startD.toISOString().split("T")[0];

  const expiries = weeklyExpiryDates(bars, start, end);
  let otm = 0;
  let total = 0;

  const barIndex = (date: string) => bars.findIndex((b) => b.date === date);

  for (let i = 1; i < expiries.length; i++) {
    const endExp = expiries[i];
    const endIdx = barIndex(endExp);
    if (endIdx < 0) continue;
    const close = bars[endIdx].close;
    const isOtm = optionType === "call" ? close < strike : close > strike;
    if (isOtm) otm++;
    total++;
  }

  if (total < 8) {
    return { rate_pct: 50, samples: total, label: "Limited weekly samples" };
  }

  const rate_pct = r1((otm / total) * 100);
  return {
    rate_pct,
    samples: total,
    label: `${otm}/${total} weekly expiries closed OTM at ${optionType === "call" ? "CE" : "PE"} ${strike}`,
  };
}

/** Empirical rate for ATM-ish weekly strangle survival (both wings). */
export function empiricalStrangleSurvival(
  bars: OHLCVBar[],
  spot: number,
  sigmaPct: number,
): { rate_pct: number; samples: number } {
  if (bars.length < 120) return { rate_pct: 50, samples: 0 };
  const end = bars.at(-1)!.date;
  const startD = new Date(end);
  startD.setFullYear(startD.getFullYear() - 3);
  const start = startD.toISOString().split("T")[0];
  const expiries = weeklyExpiryDates(bars, start, end);
  let survived = 0;
  let total = 0;

  for (let i = 1; i < expiries.length; i++) {
    const prevExp = expiries[i - 1];
    const endExp = expiries[i];
    const startIdx = bars.findIndex((b) => b.date > prevExp);
    const endIdx = bars.findIndex((b) => b.date === endExp);
    if (startIdx < 0 || endIdx < 0) continue;
    const slice = bars.slice(startIdx, endIdx + 1);
    const open0 = slice[0].open;
    if (!open0) continue;
    const up = ((Math.max(...slice.map((b) => b.high)) - open0) / open0) * 100;
    const down = ((Math.min(...slice.map((b) => b.low)) - open0) / open0) * 100;
    if (up <= sigmaPct && down >= -sigmaPct) survived++;
    total++;
  }

  return {
    rate_pct: total ? r1((survived / total) * 100) : 50,
    samples: total,
  };
}
