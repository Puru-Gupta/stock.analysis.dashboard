/** Low-level Yahoo Finance HTTP helpers (no orchestrator imports — avoids cycles). */

import type { FundamentalsData, OHLCVBar } from "./types";

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_SUMMARY = "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

type YahooRawField = number | { raw?: number | null } | null | undefined;

export function yahooNumber(value: YahooRawField): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "object" && "raw" in value) {
    const raw = value.raw;
    return raw == null ? undefined : Number(raw);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function mergeYahooCookies(existing: string, res: Response): string {
  const parts = new Set(existing.split("; ").filter(Boolean));
  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const pair = cookie.split(";")[0];
    if (pair) parts.add(pair);
  }
  return Array.from(parts).join("; ");
}

export async function getYahooSession(): Promise<{ crumb: string; cookie: string }> {
  let cookie = "";
  const initRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": YAHOO_UA },
    redirect: "follow",
  });
  cookie = mergeYahooCookies(cookie, initRes);

  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YAHOO_UA, Cookie: cookie },
  });
  cookie = mergeYahooCookies(cookie, crumbRes);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes("<") || crumb.toLowerCase().includes("error")) {
    throw new Error("Failed to obtain Yahoo Finance session");
  }
  return { crumb, cookie };
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function toUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

export async function fetchYahooBarsHttp(symbol: string, start: string, end?: string): Promise<OHLCVBar[]> {
  const period1 = toUnix(start);
  const period2 = toUnix(end || formatDate(new Date())) + 86400;
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_UA },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0];
  if (!q) return [];
  const bars: OHLCVBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (q.open[i] == null || q.close[i] == null) continue;
    bars.push({
      date: formatDate(new Date(timestamps[i] * 1000)),
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume[i] || 0,
    });
  }
  return bars;
}

export async function fetchYahooFundamentalsHttp(symbol: string): Promise<FundamentalsData> {
  const fund: FundamentalsData = { symbol };
  const { crumb, cookie } = await getYahooSession();
  const modules = "summaryDetail,defaultKeyStatistics,financialData,assetProfile";
  const url =
    `${YAHOO_SUMMARY}/${encodeURIComponent(symbol)}` +
    `?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_UA, Cookie: cookie },
    cache: "no-store",
  });
  if (!res.ok) return fund;
  const json = await res.json();
  const r = json?.quoteSummary?.result?.[0] || {};
  return {
    symbol,
    name: r.assetProfile?.longName || symbol.replace(".NS", ""),
    sector: r.assetProfile?.sector,
    industry: r.assetProfile?.industry,
    market_cap: yahooNumber(r.summaryDetail?.marketCap),
    pe_ratio: yahooNumber(r.summaryDetail?.trailingPE),
    forward_pe: yahooNumber(r.summaryDetail?.forwardPE),
    pb_ratio: yahooNumber(r.summaryDetail?.priceToBook),
    dividend_yield: yahooNumber(r.summaryDetail?.dividendYield),
    eps: yahooNumber(r.defaultKeyStatistics?.trailingEps),
    revenue_growth: yahooNumber(r.financialData?.revenueGrowth),
    earnings_growth: yahooNumber(r.financialData?.earningsGrowth),
    profit_margin: yahooNumber(r.financialData?.profitMargins),
    operating_margin: yahooNumber(r.financialData?.operatingMargins),
    roe: yahooNumber(r.financialData?.returnOnEquity),
    debt_to_equity: yahooNumber(r.financialData?.debtToEquity),
    free_cash_flow: yahooNumber(r.financialData?.freeCashflow),
  };
}

export { YAHOO_UA };
