/** Shared rebalancing constants (safe for client import). */
export const ATR_STOP_MULTIPLIER = 1.5;

export const LOOKBACK_MONTH_OPTIONS = [12, 24, 48] as const;
export type LookbackMonths = (typeof LOOKBACK_MONTH_OPTIONS)[number];

/** Trading-day approximation: months × ~21 sessions + buffer for indicators. */
export function lookbackMonthsToDays(months: number): number {
  const m = LOOKBACK_MONTH_OPTIONS.includes(months as LookbackMonths) ? months : 12;
  return Math.round(m * 30.44);
}

export function parseLookbackMonths(raw: unknown): LookbackMonths {
  const n = Number(raw);
  if (n === 24 || n === 48) return n;
  return 12;
}
