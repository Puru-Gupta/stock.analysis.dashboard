/** Consensus + quality scoring across parallel India market data agents. */

import type { FundamentalsData, OHLCVBar } from "../types";
import type {
  AgentBarsResult,
  AgentFundamentalsResult,
  AgentQuote,
  AgentSource,
  DataQualityReport,
} from "./types";

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Prefer NSE for live India prices, then yahoo, then community API. */
const SOURCE_WEIGHT: Record<AgentSource, number> = {
  yfinance: 1.0,
  nse_india: 0.95,
  yahoo_python: 0.85,
  yahoo_http: 0.7,
  indian_market_api: 0.55,
};

export function consensusPrice(quotes: AgentQuote[]): DataQualityReport["price_consensus"] {
  const ok = quotes.filter((q) => q.ok && q.last > 0);
  const samples = ok.map((q) => ({ source: q.source, last: q.last }));
  if (!samples.length) {
    return { value: 0, spread_pct: 0, samples: [], method: "single" };
  }
  if (samples.length === 1) {
    return { value: samples[0].last, spread_pct: 0, samples, method: "single" };
  }

  const values = samples.map((s) => s.last);
  const med = median(values);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const spread_pct = med > 0 ? ((max - min) / med) * 100 : 0;

  // Weighted average when spread is tight; median when sources disagree
  if (spread_pct <= 1.5) {
    let wSum = 0;
    let vSum = 0;
    for (const s of samples) {
      const w = SOURCE_WEIGHT[s.source] ?? 0.5;
      wSum += w;
      vSum += s.last * w;
    }
    return {
      value: Math.round((vSum / wSum) * 100) / 100,
      spread_pct: Math.round(spread_pct * 100) / 100,
      samples,
      method: "weighted",
    };
  }

  return {
    value: Math.round(med * 100) / 100,
    spread_pct: Math.round(spread_pct * 100) / 100,
    samples,
    method: "median",
  };
}

/** Merge OHLCV from multiple agents — prefer denser/newer sources per date. */
export function mergeBars(results: AgentBarsResult[]): OHLCVBar[] {
  const byDate = new Map<string, { bar: OHLCVBar; rank: number }>();
  const rank: Record<AgentSource, number> = {
    yfinance: 4,
    nse_india: 3,
    yahoo_python: 2,
    yahoo_http: 1,
    indian_market_api: 0,
  };

  for (const r of results) {
    if (!r.ok || !r.bars.length) continue;
    const rnk = rank[r.source] ?? 0;
    for (const bar of r.bars) {
      const existing = byDate.get(bar.date);
      if (!existing || rnk > existing.rank) {
        byDate.set(bar.date, { bar, rank: rnk });
      }
    }
  }

  return Array.from(byDate.values())
    .map((v) => v.bar)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeFundamentals(results: AgentFundamentalsResult[]): FundamentalsData {
  const ok = results.filter((r) => r.ok);
  const base: FundamentalsData = { symbol: ok[0]?.data.symbol || "" };
  const fields: (keyof FundamentalsData)[] = [
    "name", "sector", "industry", "market_cap", "pe_ratio", "forward_pe", "pb_ratio",
    "dividend_yield", "eps", "revenue_growth", "earnings_growth", "profit_margin",
    "operating_margin", "roe", "debt_to_equity", "free_cash_flow",
  ];

  // Prefer yahoo_python / yahoo_http for fundamentals depth; fill gaps from others
  const ordered = [...ok].sort((a, b) => {
    const order = {
      yfinance: 0,
      yahoo_python: 1,
      yahoo_http: 2,
      nse_india: 3,
      indian_market_api: 4,
    } as Record<AgentSource, number>;
    return (order[a.source] ?? 9) - (order[b.source] ?? 9);
  });

  for (const r of ordered) {
    for (const f of fields) {
      const v = r.data[f];
      if (v != null && v !== "" && (base[f] == null || base[f] === "")) {
        (base as unknown as Record<string, unknown>)[f] = v;
      }
    }
    if (!base.symbol && r.data.symbol) base.symbol = r.data.symbol;
  }
  return base;
}

export function buildQualityReport(opts: {
  quotes: AgentQuote[];
  bars: AgentBarsResult[];
  funds: AgentFundamentalsResult[];
  liveChain?: boolean;
}): DataQualityReport {
  const { quotes, bars, funds, liveChain = false } = opts;
  const consensus = consensusPrice(quotes);
  const sources_used = [
    ...new Set([
      ...quotes.filter((q) => q.ok).map((q) => q.source),
      ...bars.filter((b) => b.ok).map((b) => b.source),
      ...funds.filter((f) => f.ok).map((f) => f.source),
    ]),
  ];
  const sources_failed = [
    ...quotes.filter((q) => !q.ok).map((q) => ({ source: q.source, error: q.error || "failed" })),
    ...bars.filter((b) => !b.ok).map((b) => ({ source: b.source, error: b.error || "failed" })),
    ...funds.filter((f) => !f.ok).map((f) => ({ source: f.source, error: f.error || "failed" })),
  ];

  const mergedBars = mergeBars(bars);
  const fund = mergeFundamentals(funds);
  const fundFields = ["market_cap", "pe_ratio", "roe", "revenue_growth", "debt_to_equity", "sector"] as const;
  const fundHits = fundFields.filter((k) => fund[k] != null).length;
  const fundamentals_complete = fundHits >= 4;

  let accuracy_score = 40;
  accuracy_score += Math.min(30, sources_used.length * 10);
  if (consensus.samples.length >= 2 && consensus.spread_pct <= 1) accuracy_score += 15;
  else if (consensus.samples.length >= 2 && consensus.spread_pct <= 2.5) accuracy_score += 8;
  if (mergedBars.length >= 60) accuracy_score += 10;
  if (fundamentals_complete) accuracy_score += 10;
  if (liveChain) accuracy_score += 5;
  if (sources_used.includes("nse_india")) accuracy_score += 5;
  accuracy_score = Math.min(99, Math.max(0, accuracy_score));

  const notes: string[] = [];
  if (sources_used.includes("nse_india")) notes.push("Official NSE unofficial API (stock-nse-india) contributing live India prices");
  if (sources_used.includes("yahoo_python")) notes.push("yahooquery/yfinance Python fallback filled Yahoo rate-limit gaps");
  if (sources_used.includes("indian_market_api")) notes.push("Community Indian-Stock-Market-API (0xramm) cross-check enabled");
  if (consensus.samples.length >= 2) {
    notes.push(
      `Price consensus ${consensus.method}: ₹${consensus.value} across ${consensus.samples.length} agents (spread ${consensus.spread_pct}%)`,
    );
  }
  if (consensus.spread_pct > 2.5) notes.push("Elevated cross-source price spread — prefer NSE print for entries");

  return {
    accuracy_score,
    sources_used,
    sources_failed: sources_failed.slice(0, 6),
    price_consensus: consensus,
    bar_count: mergedBars.length,
    fundamentals_complete,
    live_chain: liveChain,
    notes,
  };
}
