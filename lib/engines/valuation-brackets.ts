/** Mid/small-cap valuation brackets — sector-relative when sector is known. */

import { peRelative, pbRelative, resolveSectorNorms } from "./sector-valuation";

export type ValuationBracket = "cheap" | "fair" | "premium" | "expensive" | "unknown";

export type ValuationFilter = "" | "cheap" | "fair" | "premium" | "soft";

export interface ValuationInputs {
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  revenue_growth?: number | null;
  earnings_growth?: number | null;
  market_cap?: number | null;
  fundamental_score?: number | null;
  sector?: string | null;
  industry?: string | null;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function hasGrowth(fund: ValuationInputs): boolean {
  const rg = num(fund.revenue_growth);
  const eg = num(fund.earnings_growth);
  return (rg != null && rg >= 0.15) || (eg != null && eg >= 0.15);
}

/** Classify using sector-relative PE/PB when possible; else absolute India bands. */
export function classifyValuationBracket(fund: ValuationInputs): ValuationBracket {
  const pe = num(fund.pe_ratio);
  const pb = num(fund.pb_ratio);
  const growth = hasGrowth(fund);
  const norms = resolveSectorNorms(fund.sector, fund.industry);
  const peRel = pe != null ? peRelative(pe, norms) : null;
  const pbRel = pb != null ? pbRelative(pb, norms) : null;

  if (pe == null && pb == null) return "unknown";

  // Banks / NBFCs: prefer P/B relative
  if (norms.prefer_pb && pbRel != null) {
    if (pbRel <= 0.85) return "cheap";
    if (pbRel <= 1.15) return "fair";
    if (pbRel <= 1.4 && growth) return "premium";
    return "expensive";
  }

  if (peRel != null) {
    if (peRel <= 0.85 && (pbRel == null || pbRel <= 1.15)) return "cheap";
    if (peRel <= 1.15 && (pbRel == null || pbRel <= 1.35)) return "fair";
    if (peRel <= 1.45 && growth) return "premium";
    if (peRel > 1.45 || (pbRel != null && pbRel > 1.6)) return "expensive";
    return growth ? "premium" : "expensive";
  }

  // Absolute fallback
  if ((pe != null && pe > 40) || (pb != null && pb > 6 && (pe == null || pe > 28))) {
    if (pe != null && pe > 28 && pe <= 40 && growth) return "premium";
    return "expensive";
  }
  if (pe != null && pe > 28 && pe <= 40) return growth ? "premium" : "expensive";
  if (pe != null && pe > 18 && pe <= 28 && (pb == null || pb <= 5)) return "fair";
  if (pe != null && pe > 0 && pe <= 18 && (pb == null || pb <= 3)) return "cheap";
  if (pe == null && pb != null) {
    if (pb <= 2) return "cheap";
    if (pb <= 5) return "fair";
    if (pb <= 6 && growth) return "premium";
    return "expensive";
  }
  return "unknown";
}

export function passesMarketCapBand(
  universe: string,
  marketCap: number | null | undefined,
): boolean {
  // Mid/small lists are pre-curated in universes.ts — Yahoo mcap bands are stale
  // (many index midcaps now exceed ₹50k Cr) and would wrongly drop valid names.
  if (universe === "midcap" || universe === "smallcap") return true;

  const mcap = num(marketCap);
  if (mcap == null || mcap <= 0) return true;

  return true;
}

export function passesValuationFilter(opts: {
  universe: string;
  valuation: ValuationFilter;
  bracket: ValuationBracket;
  fundamental_score?: number | null;
}): boolean {
  const { universe, valuation, bracket, fundamental_score } = opts;
  const midSmall = universe === "midcap" || universe === "smallcap";
  const usesBrackets = midSmall || universe === "nifty500";

  if (!usesBrackets) return true;

  if (bracket === "unknown") {
    const fs = num(fundamental_score) ?? 0;
    if (valuation === "cheap" || valuation === "fair" || valuation === "premium") {
      return false;
    }
    // Soft filter: allow unknown fundamentals if composite score is acceptable
    return fs >= 45;
  }

  const filter: ValuationFilter =
    valuation === "" && midSmall ? "soft" : valuation === "" ? "" : valuation;

  if (filter === "" || filter === "soft") {
    if (midSmall || filter === "soft") {
      return bracket === "cheap" || bracket === "fair";
    }
    return true;
  }

  return bracket === filter;
}
