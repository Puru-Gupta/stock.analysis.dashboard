/**
 * Multi-agent live data orchestrator for Indian equities.
 * Primary: yahoo-finance2 (Node yfinance) — works on Vercel.
 * Parallel backups: NSE · Yahoo HTTP · Python yahooquery · community API
 */

import { fetchYahooBarsHttp, fetchYahooFundamentalsHttp } from "../yahoo-http";
import { fetchFundamentalsViaPython, fetchHistoryViaPython, isPythonFetcherAvailable } from "../yahoo-python";
import { fetchYFinanceBars, fetchYFinanceFundamentals, fetchYFinanceQuote } from "../yfinance";
import type { FundamentalsData, OHLCVBar } from "../types";
import { buildQualityReport, consensusPrice, mergeBars, mergeFundamentals } from "./consensus";
import { indianMarketApiQuoteAgent } from "./indian-market-api";
import { nseBarsAgent, nseOptionChainAgent, nseQuoteAgent } from "./nse-india";
import type {
  AgentBarsResult,
  AgentFundamentalsResult,
  AgentOptionChain,
  AgentQuote,
  DataQualityReport,
} from "./types";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function yfinanceBarsAgent(symbol: string, days: number): Promise<AgentBarsResult> {
  const t0 = Date.now();
  try {
    const bars = await fetchYFinanceBars(symbol, days);
    return {
      source: "yfinance",
      bars,
      latency_ms: Date.now() - t0,
      ok: bars.length > 0,
      error: bars.length ? undefined : "yfinance returned no bars",
    };
  } catch (e) {
    return {
      source: "yfinance",
      bars: [],
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "yfinance failed",
    };
  }
}

async function yfinanceQuoteAgent(symbol: string): Promise<AgentQuote> {
  const t0 = Date.now();
  try {
    const q = await fetchYFinanceQuote(symbol);
    return {
      source: "yfinance",
      symbol,
      last: q?.last ?? 0,
      name: q?.name,
      change: q?.change,
      change_pct: q?.change_pct,
      fetched_at: new Date().toISOString(),
      latency_ms: Date.now() - t0,
      ok: !!q?.last,
      error: q?.last ? undefined : "yfinance quote empty",
    };
  } catch (e) {
    return {
      source: "yfinance",
      symbol,
      last: 0,
      fetched_at: new Date().toISOString(),
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "yfinance quote failed",
    };
  }
}

async function yahooHttpBarsAgent(symbol: string, days: number): Promise<AgentBarsResult> {
  const t0 = Date.now();
  try {
    const bars = await fetchYahooBarsHttp(symbol, daysAgo(days));
    return {
      source: "yahoo_http",
      bars,
      latency_ms: Date.now() - t0,
      ok: bars.length > 0,
      error: bars.length ? undefined : "Yahoo HTTP returned no bars",
    };
  } catch (e) {
    return {
      source: "yahoo_http",
      bars: [],
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "Yahoo HTTP failed",
    };
  }
}

async function yahooPythonBarsAgent(symbol: string, days: number): Promise<AgentBarsResult> {
  const t0 = Date.now();
  if (!isPythonFetcherAvailable()) {
    return { source: "yahoo_python", bars: [], latency_ms: 0, ok: false, error: "Python venv unavailable" };
  }
  try {
    const bars = await fetchHistoryViaPython(symbol, days);
    return {
      source: "yahoo_python",
      bars,
      latency_ms: Date.now() - t0,
      ok: bars.length > 0,
      error: bars.length ? undefined : "Python yfinance returned no bars",
    };
  } catch (e) {
    return {
      source: "yahoo_python",
      bars: [],
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "Python history failed",
    };
  }
}

function quoteFromBars(source: AgentQuote["source"], symbol: string, bars: OHLCVBar[]): AgentQuote {
  const last = bars.at(-1)?.close ?? 0;
  return {
    source,
    symbol,
    last,
    open: bars.at(-1)?.open,
    high: bars.at(-1)?.high,
    low: bars.at(-1)?.low,
    volume: bars.at(-1)?.volume,
    fetched_at: new Date().toISOString(),
    latency_ms: 0,
    ok: last > 0,
  };
}

async function fundamentalsAgents(symbol: string): Promise<AgentFundamentalsResult[]> {
  const results: AgentFundamentalsResult[] = [];

  const t0 = Date.now();
  try {
    const data = await fetchYFinanceFundamentals(symbol);
    const ok = !!(data.market_cap || data.pe_ratio || data.roe || data.sector);
    results.push({
      source: "yfinance",
      data,
      latency_ms: Date.now() - t0,
      ok,
      error: ok ? undefined : "Sparse yfinance fundamentals",
    });
  } catch (e) {
    results.push({
      source: "yfinance",
      data: { symbol },
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "yfinance fundamentals failed",
    });
  }

  if (!results[0]?.ok) {
    const t1 = Date.now();
    try {
      const data = await fetchYahooFundamentalsHttp(symbol);
      const ok = !!(data.market_cap || data.pe_ratio || data.roe || data.sector);
      results.push({
        source: "yahoo_http",
        data,
        latency_ms: Date.now() - t1,
        ok,
        error: ok ? undefined : "Sparse Yahoo fundamentals",
      });
    } catch (e) {
      results.push({
        source: "yahoo_http",
        data: { symbol },
        latency_ms: Date.now() - t1,
        ok: false,
        error: e instanceof Error ? e.message : "fundamentals failed",
      });
    }
  }

  if (isPythonFetcherAvailable() && !results.some((r) => r.ok)) {
    const t2 = Date.now();
    const data = await fetchFundamentalsViaPython(symbol);
    if (data) {
      const ok = !!(data.market_cap || data.pe_ratio || data.roe || data.sector);
      results.push({
        source: "yahoo_python",
        data,
        latency_ms: Date.now() - t2,
        ok,
        error: ok ? undefined : "Sparse Python fundamentals",
      });
    }
  }

  return results;
}

export interface LiveMarketBundle {
  symbol: string;
  bars: OHLCVBar[];
  quote: number;
  fundamentals: FundamentalsData;
  quality: DataQualityReport;
  quotes: AgentQuote[];
  option_chain?: AgentOptionChain;
  agents_ms: number;
}

export async function fetchLiveMarketBundle(
  symbol: string,
  opts: { days?: number; includeOptions?: boolean } = {},
): Promise<LiveMarketBundle> {
  const days = opts.days ?? 365;
  const t0 = Date.now();

  // yfinance first (reliable on Vercel); other agents with short timeouts so we don't hang
  const emptyBars = (source: AgentBarsResult["source"]): AgentBarsResult => ({
    source, bars: [], latency_ms: 0, ok: false, error: "timeout/skipped",
  });
  const emptyQuote = (source: AgentQuote["source"]): AgentQuote => ({
    source, symbol, last: 0, fetched_at: new Date().toISOString(), latency_ms: 0, ok: false, error: "timeout/skipped",
  });

  const [
    yfBars,
    yfQuote,
    nseQuote,
    nseBars,
    communityQuote,
    yahooBars,
    pythonBars,
    funds,
    optionChain,
  ] = await Promise.all([
    yfinanceBarsAgent(symbol, days),
    yfinanceQuoteAgent(symbol),
    withTimeout(nseQuoteAgent(symbol), 6000, emptyQuote("nse_india")),
    withTimeout(nseBarsAgent(symbol), 8000, emptyBars("nse_india")),
    withTimeout(indianMarketApiQuoteAgent(symbol), 4000, emptyQuote("indian_market_api")),
    withTimeout(yahooHttpBarsAgent(symbol, days), 6000, emptyBars("yahoo_http")),
    withTimeout(yahooPythonBarsAgent(symbol, days), 12000, emptyBars("yahoo_python")),
    fundamentalsAgents(symbol),
    opts.includeOptions
      ? withTimeout(nseOptionChainAgent(symbol), 10000, {
          source: "nse_india" as const,
          symbol,
          underlying: 0,
          expiries: [],
          legs: [],
          latency_ms: 0,
          ok: false,
          error: "timeout",
        })
      : Promise.resolve(undefined),
  ]);

  const barResults = [yfBars, nseBars, yahooBars, pythonBars];
  let bars = mergeBars(barResults);

  // Hard guarantee: if merge empty but yfinance alone has data, use it
  if (!bars.length && yfBars.ok) bars = yfBars.bars;
  if (!bars.length && pythonBars.ok) bars = pythonBars.bars;
  if (!bars.length && yahooBars.ok) bars = yahooBars.bars;
  if (!bars.length && nseBars.ok) bars = nseBars.bars;

  const quotes: AgentQuote[] = [yfQuote, nseQuote, communityQuote].filter((q) => q.ok || q.source === "yfinance");
  if (yfBars.ok) quotes.push(quoteFromBars("yfinance", symbol, yfBars.bars));
  else if (yahooBars.ok) quotes.push(quoteFromBars("yahoo_http", symbol, yahooBars.bars));
  else if (pythonBars.ok) quotes.push(quoteFromBars("yahoo_python", symbol, pythonBars.bars));

  const quality = buildQualityReport({
    quotes,
    bars: barResults,
    funds,
    liveChain: !!optionChain?.ok && (optionChain.legs.length > 0 || optionChain.underlying > 0),
  });

  const consensus = consensusPrice(quotes.filter((q) => q.ok));
  let quote = consensus.value || yfQuote.last;
  if (!quote && bars.length) quote = bars.at(-1)!.close;

  if (bars.length && quote > 0) {
    const last = bars[bars.length - 1];
    const drift = Math.abs(last.close - quote) / quote;
    if (drift > 0 && drift < 0.02) {
      bars[bars.length - 1] = { ...last, close: quote };
    }
  }

  const fundamentals = mergeFundamentals(funds);
  if (!fundamentals.name && yfQuote.name) fundamentals.name = yfQuote.name;
  if (!fundamentals.name && nseQuote.name) fundamentals.name = nseQuote.name;
  if (!fundamentals.sector && nseQuote.sector) fundamentals.sector = nseQuote.sector;
  if (!fundamentals.industry && nseQuote.industry) fundamentals.industry = nseQuote.industry;
  if (!fundamentals.pe_ratio && nseQuote.pe) fundamentals.pe_ratio = nseQuote.pe;
  if (!fundamentals.symbol) fundamentals.symbol = symbol;

  return {
    symbol,
    bars,
    quote,
    fundamentals,
    quality,
    quotes: quotes.filter((q) => q.ok),
    option_chain: optionChain,
    agents_ms: Date.now() - t0,
  };
}

export async function fetchLiveOptionChain(symbol: string): Promise<AgentOptionChain> {
  return nseOptionChainAgent(symbol);
}
