/**
 * India sector-relative valuation helpers.
 * Absolute PE is misleading across banks / IT / FMCG — score vs sector median.
 */

export interface SectorValuationNorms {
  sector_key: string;
  pe_median: number;
  pb_median: number;
  /** Prefer P/B + ROE for banks/NBFCs */
  prefer_pb: boolean;
}

const NORMS: Record<string, SectorValuationNorms> = {
  banking: { sector_key: "banking", pe_median: 15, pb_median: 2.2, prefer_pb: true },
  financials: { sector_key: "financials", pe_median: 18, pb_median: 2.5, prefer_pb: true },
  it: { sector_key: "it", pe_median: 26, pb_median: 7, prefer_pb: false },
  pharma: { sector_key: "pharma", pe_median: 32, pb_median: 5, prefer_pb: false },
  healthcare: { sector_key: "healthcare", pe_median: 40, pb_median: 6, prefer_pb: false },
  auto: { sector_key: "auto", pe_median: 28, pb_median: 4.5, prefer_pb: false },
  fmcg: { sector_key: "fmcg", pe_median: 48, pb_median: 10, prefer_pb: false },
  consumer: { sector_key: "consumer", pe_median: 45, pb_median: 9, prefer_pb: false },
  energy: { sector_key: "energy", pe_median: 14, pb_median: 1.8, prefer_pb: false },
  oil: { sector_key: "oil", pe_median: 12, pb_median: 1.5, prefer_pb: false },
  metals: { sector_key: "metals", pe_median: 14, pb_median: 2, prefer_pb: false },
  materials: { sector_key: "materials", pe_median: 22, pb_median: 3, prefer_pb: false },
  realty: { sector_key: "realty", pe_median: 38, pb_median: 4, prefer_pb: false },
  industrials: { sector_key: "industrials", pe_median: 30, pb_median: 5, prefer_pb: false },
  utilities: { sector_key: "utilities", pe_median: 18, pb_median: 2.2, prefer_pb: false },
  telecom: { sector_key: "telecom", pe_median: 35, pb_median: 4, prefer_pb: false },
  default: { sector_key: "default", pe_median: 24, pb_median: 3.5, prefer_pb: false },
};

export function resolveSectorNorms(sector?: string | null, industry?: string | null): SectorValuationNorms {
  const blob = `${sector || ""} ${industry || ""}`.toLowerCase();
  if (/bank|nbfc|finance|insurance|lender/.test(blob)) {
    return /bank/.test(blob) ? NORMS.banking : NORMS.financials;
  }
  if (/information technology|software|it services|technology/.test(blob)) return NORMS.it;
  if (/pharma|drug|biotech/.test(blob)) return NORMS.pharma;
  if (/health|hospital|diagnostic/.test(blob)) return NORMS.healthcare;
  if (/auto|automobile|vehicle|tyre/.test(blob)) return NORMS.auto;
  if (/fmcg|consumer staples|beverage|food/.test(blob)) return NORMS.fmcg;
  if (/consumer discretionary|retail|apparel/.test(blob)) return NORMS.consumer;
  if (/oil|gas|petroleum|refiner/.test(blob)) return NORMS.oil;
  if (/energy|power|utility|renewable/.test(blob)) return /utility|power/.test(blob) ? NORMS.utilities : NORMS.energy;
  if (/metal|steel|mining|aluminium|zinc|copper/.test(blob)) return NORMS.metals;
  if (/cement|chemical|material/.test(blob)) return NORMS.materials;
  if (/realty|real estate|property|housing/.test(blob)) return NORMS.realty;
  if (/industrial|capital goods|engineering|defence|defense/.test(blob)) return NORMS.industrials;
  if (/telecom|communication/.test(blob)) return NORMS.telecom;
  return NORMS.default;
}

/** PE / sector median — 1.0 = at median, &lt;0.85 cheap-ish, &gt;1.35 expensive. */
export function peRelative(pe: number | null | undefined, norms: SectorValuationNorms): number | null {
  if (pe == null || pe <= 0 || !norms.pe_median) return null;
  return Math.round((pe / norms.pe_median) * 100) / 100;
}

export function pbRelative(pb: number | null | undefined, norms: SectorValuationNorms): number | null {
  if (pb == null || pb <= 0 || !norms.pb_median) return null;
  return Math.round((pb / norms.pb_median) * 100) / 100;
}

export function pegApprox(
  pe: number | null | undefined,
  earningsGrowth: number | null | undefined,
): number | null {
  if (pe == null || pe <= 0) return null;
  const g = earningsGrowth != null && earningsGrowth > 0 ? earningsGrowth * 100 : null;
  if (g == null || g < 1) return null;
  return Math.round((pe / g) * 100) / 100;
}
