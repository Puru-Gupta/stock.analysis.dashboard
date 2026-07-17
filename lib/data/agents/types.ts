import type { FundamentalsData, OHLCVBar } from "../types";

export type AgentSource =
  | "yfinance"
  | "nse_india"
  | "yahoo_http"
  | "yahoo_python"
  | "indian_market_api";

export interface AgentQuote {
  source: AgentSource;
  symbol: string;
  last: number;
  open?: number;
  high?: number;
  low?: number;
  previous_close?: number;
  change?: number;
  change_pct?: number;
  volume?: number;
  name?: string;
  sector?: string;
  industry?: string;
  pe?: number;
  fetched_at: string;
  latency_ms: number;
  ok: boolean;
  error?: string;
}

export interface AgentBarsResult {
  source: AgentSource;
  bars: OHLCVBar[];
  latency_ms: number;
  ok: boolean;
  error?: string;
}

export interface AgentFundamentalsResult {
  source: AgentSource;
  data: FundamentalsData;
  latency_ms: number;
  ok: boolean;
  error?: string;
}

export interface AgentOptionLeg {
  strike: number;
  expiry: string;
  type: "CE" | "PE";
  ltp: number;
  iv?: number;
  oi?: number;
  change_oi?: number;
  volume?: number;
  bid?: number;
  ask?: number;
}

export interface AgentOptionChain {
  source: AgentSource;
  symbol: string;
  underlying: number;
  expiries: string[];
  legs: AgentOptionLeg[];
  latency_ms: number;
  ok: boolean;
  error?: string;
}

export interface DataQualityReport {
  accuracy_score: number;
  sources_used: AgentSource[];
  sources_failed: { source: AgentSource; error: string }[];
  price_consensus: {
    value: number;
    spread_pct: number;
    samples: { source: AgentSource; last: number }[];
    method: "median" | "single" | "weighted";
  };
  bar_count: number;
  fundamentals_complete: boolean;
  live_chain: boolean;
  notes: string[];
}

export interface TradeAdvantage {
  title: string;
  detail: string;
  weight: "high" | "medium" | "edge";
}

export interface ModeDetails {
  mode: string;
  label: string;
  objective: string;
  when_to_use: string[];
  advantages: string[];
  risks: string[];
  invalidation: string;
  best_for: string;
}
