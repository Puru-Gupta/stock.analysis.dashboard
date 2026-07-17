export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FundamentalsData {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  pe_ratio?: number;
  forward_pe?: number;
  pb_ratio?: number;
  dividend_yield?: number;
  eps?: number;
  revenue_growth?: number;
  earnings_growth?: number;
  profit_margin?: number;
  operating_margin?: number;
  roe?: number;
  debt_to_equity?: number;
  free_cash_flow?: number;
}

export interface SyncResult {
  symbol: string;
  barsAdded: number;
  totalBars: number;
  lastBarDate: string | null;
  syncType: "full" | "incremental" | "cached";
}
