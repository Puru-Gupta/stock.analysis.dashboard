import { daysToExpiryFromNseDate } from "./greeks";

/** When nearest expiry is at or below this DTE, surface the next expiry chain for sellers. */
export const NEAR_EXPIRY_CHAIN_DTE = 10;

export interface ResolvedExpiries {
  nearestExpiry: string;
  nearestDte: number;
  nextExpiry?: string;
  nextDte?: number;
  /** Next expiry chain should be included alongside the nearest series. */
  includeNextChain: boolean;
}

export function resolveOptionExpiries(expiries: string[] | undefined | null): ResolvedExpiries {
  const list = [...new Set((expiries || []).filter(Boolean))];
  const nearestExpiry = list[0] || "";
  const nearestDte = nearestExpiry ? daysToExpiryFromNseDate(nearestExpiry) : 30;
  const nextExpiry = list[1];
  const nextDte = nextExpiry ? daysToExpiryFromNseDate(nextExpiry) : undefined;
  const includeNextChain =
    !!nextExpiry &&
    nearestDte > 0 &&
    nearestDte <= NEAR_EXPIRY_CHAIN_DTE &&
    (nextDte ?? 0) > nearestDte;

  return { nearestExpiry, nearestDte, nextExpiry, nextDte, includeNextChain };
}
