import type { AgentOptionLeg } from "@/lib/data/agents/types";
import { daysToExpiryFromNseDate } from "./greeks";
import { normalizeIv } from "./options";

export interface ChainSurfaceMetrics {
  pcr_oi: number | null;
  pcr_volume: number | null;
  max_pain: number | null;
  max_pain_dist_pct: number | null;
  skew_25d: number | null;
  skew_label: string;
  term_near_iv: number | null;
  term_next_iv: number | null;
  term_structure: "backwardation" | "contango" | "flat" | null;
  term_spread_pct: number | null;
}

function computeMaxPain(legs: AgentOptionLeg[]): number | null {
  const withOi = legs.filter((l) => (l.oi || 0) > 0);
  const strikes = [...new Set(withOi.map((l) => l.strike))].sort((a, b) => a - b);
  if (strikes.length < 3) return null;
  let best: number | null = null;
  let bestPain = Infinity;
  for (const s of strikes) {
    let pain = 0;
    for (const l of withOi) {
      const oi = l.oi || 0;
      pain += l.type === "CE" ? oi * Math.max(0, s - l.strike) : oi * Math.max(0, l.strike - s);
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = s;
    }
  }
  return best;
}

function atmIvForExpiry(legs: AgentOptionLeg[], expiry: string, spot: number, hv: number): number | null {
  const expLegs = legs.filter((l) => l.expiry === expiry && l.iv && l.iv > 0);
  if (!expLegs.length) return null;
  const atm = expLegs.reduce((best, leg) =>
    Math.abs(leg.strike - spot) < Math.abs(best.strike - spot) ? leg : best,
  );
  return normalizeIv(atm.iv, hv);
}

function otmIv(legs: AgentOptionLeg[], expiry: string, spot: number, type: "CE" | "PE", hv: number): number | null {
  const expLegs = legs.filter((l) => l.expiry === expiry && l.type === type && l.iv && l.iv > 0);
  if (!expLegs.length) return null;
  const target = type === "PE" ? spot * 0.95 : spot * 1.05;
  const leg = expLegs.reduce((best, l) =>
    Math.abs(l.strike - target) < Math.abs(best.strike - target) ? l : best,
  );
  return normalizeIv(leg.iv, hv);
}

export function analyzeChainSurface(
  legs: AgentOptionLeg[],
  spot: number,
  expiries: string[],
  hv: number,
): ChainSurfaceMetrics {
  const nearest = expiries[0];
  const nearLegs = nearest ? legs.filter((l) => l.expiry === nearest) : legs;

  const ceOi = nearLegs.filter((l) => l.type === "CE").reduce((s, l) => s + (l.oi || 0), 0);
  const peOi = nearLegs.filter((l) => l.type === "PE").reduce((s, l) => s + (l.oi || 0), 0);
  const ceVol = nearLegs.filter((l) => l.type === "CE").reduce((s, l) => s + (l.volume || 0), 0);
  const peVol = nearLegs.filter((l) => l.type === "PE").reduce((s, l) => s + (l.volume || 0), 0);

  const pcr_oi = ceOi > 0 ? Math.round((peOi / ceOi) * 100) / 100 : null;
  const pcr_volume = ceVol > 0 ? Math.round((peVol / ceVol) * 100) / 100 : null;

  const max_pain = computeMaxPain(nearLegs);
  const max_pain_dist_pct =
    max_pain && spot > 0 ? Math.round(((max_pain - spot) / spot) * 1000) / 10 : null;

  const putIv = nearest ? otmIv(legs, nearest, spot, "PE", hv) : null;
  const callIv = nearest ? otmIv(legs, nearest, spot, "CE", hv) : null;
  const skew_25d =
    putIv != null && callIv != null ? Math.round((putIv - callIv) * 1000) / 10 : null;
  let skew_label = "Neutral skew";
  if (skew_25d != null) {
    if (skew_25d > 3) skew_label = "Put skew elevated — downside fear";
    else if (skew_25d < -2) skew_label = "Call skew rich — upside demand";
    else skew_label = "Balanced smile";
  }

  const term_near_iv = expiries[0] ? atmIvForExpiry(legs, expiries[0], spot, hv) : null;
  const term_next_iv = expiries[1] ? atmIvForExpiry(legs, expiries[1], spot, hv) : null;
  let term_structure: ChainSurfaceMetrics["term_structure"] = null;
  let term_spread_pct: number | null = null;
  if (term_near_iv != null && term_next_iv != null && term_next_iv > 0) {
    term_spread_pct = Math.round(((term_near_iv - term_next_iv) / term_next_iv) * 1000) / 10;
    if (term_spread_pct > 4) term_structure = "backwardation";
    else if (term_spread_pct < -4) term_structure = "contango";
    else term_structure = "flat";
  }

  return {
    pcr_oi,
    pcr_volume,
    max_pain,
    max_pain_dist_pct,
    skew_25d,
    skew_label,
    term_near_iv: term_near_iv != null ? Math.round(term_near_iv * 1000) / 10 : null,
    term_next_iv: term_next_iv != null ? Math.round(term_next_iv * 1000) / 10 : null,
    term_structure,
    term_spread_pct,
  };
}

/** Lightweight ATM IV + DTE from chain (for scan). */
export function quickChainIv(
  legs: AgentOptionLeg[],
  expiries: string[],
  spot: number,
  hv: number,
): { atmIv: number; ivIsProxy: boolean; dte: number } {
  if (!legs.length || !expiries.length) return { atmIv: hv, ivIsProxy: true, dte: 30 };
  const expiry = expiries[0];
  const iv = atmIvForExpiry(legs, expiry, spot, hv);
  const dte = daysToExpiryFromNseDate(expiry);
  if (iv == null) return { atmIv: hv, ivIsProxy: true, dte };
  const hasNseIv = legs.some((l) => l.expiry === expiry && l.iv && l.iv > 0);
  return { atmIv: iv, ivIsProxy: !hasNseIv, dte };
}
