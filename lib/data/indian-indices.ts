/** Indian index definitions for forecast, options, and NSE chain routing. */

export interface IndianIndexDef {
  id: string;
  label: string;
  /** Yahoo Finance ticker for history */
  yahoo: string;
  /** NSE index option chain symbol */
  nse_chain: string;
  /** NSE index quote name */
  nse_quote: string;
  news_terms: string[];
}

export const INDIAN_INDICES: IndianIndexDef[] = [
  {
    id: "nifty",
    label: "Nifty 50",
    yahoo: "^NSEI",
    nse_chain: "NIFTY",
    nse_quote: "NIFTY 50",
    news_terms: ["nifty", "nifty 50", "sensex", "nse", "fii", "dii"],
  },
  {
    id: "banknifty",
    label: "Bank Nifty",
    yahoo: "^NSEBANK",
    nse_chain: "BANKNIFTY",
    nse_quote: "NIFTY BANK",
    news_terms: ["bank nifty", "banknifty", "nifty bank", "rbi", "repo rate", "npa", "credit growth"],
  },
  {
    id: "finnifty",
    label: "Fin Nifty",
    yahoo: "^CNXFIN",
    nse_chain: "FINNIFTY",
    nse_quote: "NIFTY FINANCIAL SERVICES",
    news_terms: ["fin nifty", "finnifty", "financial services", "hdfc", "icici", "sbi", "nbfc"],
  },
  {
    id: "midcpnifty",
    label: "Midcap Nifty",
    yahoo: "^NSMIDCP",
    nse_chain: "MIDCPNIFTY",
    nse_quote: "NIFTY MIDCAP SELECT",
    news_terms: ["midcap nifty", "midcap", "mid-cap", "smallcap"],
  },
];

const YAHOO_BY_ALIAS: Record<string, string> = {
  NIFTY: "^NSEI",
  "^NSEI": "^NSEI",
  NSEI: "^NSEI",
  BANKNIFTY: "^NSEBANK",
  "^NSEBANK": "^NSEBANK",
  NSEBANK: "^NSEBANK",
  FINNIFTY: "^CNXFIN",
  "^CNXFIN": "^CNXFIN",
  CNXFIN: "^CNXFIN",
  MIDCPNIFTY: "^NSMIDCP",
  "^NSMIDCP": "^NSMIDCP",
  NSMIDCP: "^NSMIDCP",
  INDIAVIX: "^INDIAVIX",
  "^INDIAVIX": "^INDIAVIX",
};

export function resolveIndexYahoo(symbol: string): string | null {
  const s = symbol.toUpperCase().replace(/\.NS$/i, "");
  return YAHOO_BY_ALIAS[s] ?? null;
}

export function getIndianIndex(idOrSymbol: string): IndianIndexDef | undefined {
  const key = idOrSymbol.toUpperCase().replace(/\.NS$/i, "");
  const q = key.toLowerCase();
  return INDIAN_INDICES.find(
    (i) =>
      i.id === q ||
      i.yahoo.toUpperCase() === key ||
      i.nse_chain.toUpperCase() === key,
  );
}
