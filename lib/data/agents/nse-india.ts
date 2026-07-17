/** NSE India agent via hi-imcodeman/stock-nse-india (unofficial NSE API). */

import { NseIndia } from "stock-nse-india";
import type { OHLCVBar } from "../types";
import type { AgentBarsResult, AgentOptionChain, AgentOptionLeg, AgentQuote } from "./types";

const nse = new NseIndia();

function stripNs(symbol: string): string {
  return symbol.replace(/\.NS$/i, "").replace(/^\^/, "").toUpperCase();
}

function parseNseDate(raw: string): string | null {
  // "19-Sep-2025" or "15-Jun-2026"
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const mon = months[m[2]];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const INDEX_QUOTE_MAP: Record<string, string> = {
  NIFTY: "NIFTY 50",
  "^NSEI": "NIFTY 50",
  NSEI: "NIFTY 50",
  BANKNIFTY: "NIFTY BANK",
  "^NSEBANK": "NIFTY BANK",
  NSEBANK: "NIFTY BANK",
  FINNIFTY: "NIFTY FINANCIAL SERVICES",
  MIDCPNIFTY: "NIFTY MIDCAP SELECT",
};

export async function nseQuoteAgent(symbol: string): Promise<AgentQuote> {
  const bare = stripNs(symbol);
  const t0 = Date.now();
  const indexName = INDEX_QUOTE_MAP[bare] || INDEX_QUOTE_MAP[symbol.toUpperCase()];

  try {
    if (indexName) {
      const idx = await nse.getEquityStockIndices(indexName);
      const meta = (idx as { metadata?: Record<string, unknown> })?.metadata || {};
      const last =
        num(meta.last) ||
        num(meta.previousClose) ||
        num((idx as { last?: number }).last) ||
        0;
      return {
        source: "nse_india",
        symbol: bare,
        last,
        previous_close: num(meta.previousClose),
        change: num(meta.change),
        change_pct: num(meta.percChange),
        high: num(meta.high) || num(meta.yearHigh),
        low: num(meta.low) || num(meta.yearLow),
        name: indexName,
        fetched_at: new Date().toISOString(),
        latency_ms: Date.now() - t0,
        ok: last > 0,
        error: last > 0 ? undefined : "NSE index quote empty",
      };
    }

    const [details, trade] = await Promise.all([
      nse.getEquityDetails(bare),
      nse.getEquityTradeInfo(bare).catch(() => null),
    ]);
    const pi = details?.priceInfo || {};
    const info = details?.info || {};
    const meta = details?.metadata || {};
    const last =
      num(pi.lastPrice) ||
      num(pi.close) ||
      num(pi.previousClose) ||
      num(pi.basePrice) ||
      0;
    const volume = num(trade?.marketDeptOrderBook?.tradeInfo?.totalTradedVolume);

    return {
      source: "nse_india",
      symbol: bare,
      last,
      open: num(pi.open) || undefined,
      high: num(pi.intraDayHighLow?.max) || undefined,
      low: num(pi.intraDayHighLow?.min) || undefined,
      previous_close: num(pi.previousClose) || num(pi.basePrice),
      change: num(pi.change),
      change_pct: num(pi.pChange),
      volume,
      name: info.companyName || bare,
      industry: info.industry || meta.industry || undefined,
      pe: num(meta.pdSymbolPe) || undefined,
      fetched_at: new Date().toISOString(),
      latency_ms: Date.now() - t0,
      ok: last > 0,
      error: last > 0 ? undefined : "NSE returned zero last price (likely after hours)",
    };
  } catch (e) {
    return {
      source: "nse_india",
      symbol: bare,
      last: 0,
      fetched_at: new Date().toISOString(),
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "NSE quote failed",
    };
  }
}

export async function nseBarsAgent(symbol: string): Promise<AgentBarsResult> {
  const bare = stripNs(symbol);
  const t0 = Date.now();
  try {
    const hist = await nse.getEquityHistoricalData(bare);
    const rows = (Array.isArray(hist) ? hist : []).flatMap((chunk: { data?: unknown[] }) => chunk.data || []);
    const bars: OHLCVBar[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const date = parseNseDate(String(row.mtimestamp || ""));
      const open = num(row.chOpeningPrice);
      const high = num(row.chTradeHighPrice);
      const low = num(row.chTradeLowPrice);
      const close = num(row.chClosingPrice) ?? num(row.chLastTradedPrice);
      const volume = num(row.chTotTradedQty) ?? 0;
      if (!date || open == null || close == null || high == null || low == null) continue;
      bars.push({ date, open, high, low, close, volume });
    }
    bars.sort((a, b) => a.date.localeCompare(b.date));
    return {
      source: "nse_india",
      bars,
      latency_ms: Date.now() - t0,
      ok: bars.length > 0,
      error: bars.length ? undefined : "No NSE historical bars",
    };
  } catch (e) {
    return {
      source: "nse_india",
      bars: [],
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "NSE history failed",
    };
  }
}

const INDEX_ALIASES: Record<string, string> = {
  NIFTY: "NIFTY",
  "^NSEI": "NIFTY",
  NSEI: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  "^NSEBANK": "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "MIDCPNIFTY",
};

export async function nseOptionChainAgent(symbol: string): Promise<AgentOptionChain> {
  const bare = stripNs(symbol);
  const t0 = Date.now();
  try {
    const indexSym = INDEX_ALIASES[bare] || INDEX_ALIASES[symbol.toUpperCase()];
    let raw: Record<string, unknown> | null = null;

    if (indexSym) {
      raw = (await nse.getIndexOptionChain(indexSym)) as unknown as Record<string, unknown>;
    } else {
      // Equity F&O chain endpoint often returns futures+options mixed payload
      raw = (await nse.getEquityOptionChain(bare)) as unknown as Record<string, unknown>;
    }

    const records = (raw?.records || raw) as Record<string, unknown>;
    const data = (records?.data || raw?.data || []) as Record<string, unknown>[];
    const underlying =
      num(records?.underlyingValue) ||
      num((data[0] as { underlyingValue?: number })?.underlyingValue) ||
      0;
    const expiries = (records?.expiryDates as string[]) || [
      ...new Set(data.map((d) => String(d.expiryDate || d.expiryDates || "")).filter(Boolean)),
    ];

    const legs: AgentOptionLeg[] = [];
    for (const row of data) {
      // Index-style CE/PE nested
      for (const side of ["CE", "PE"] as const) {
        const leg = row[side] as Record<string, unknown> | undefined;
        if (!leg) continue;
        const strike = num(row.strikePrice) ?? num(leg.strikePrice);
        if (strike == null) continue;
        legs.push({
          strike,
          expiry: String(leg.expiryDate || row.expiryDates || row.expiryDate || ""),
          type: side,
          ltp: num(leg.lastPrice) ?? 0,
          iv: num(leg.impliedVolatility),
          oi: num(leg.openInterest),
          change_oi: num(leg.changeinOpenInterest),
          volume: num(leg.totalTradedVolume),
          bid: num(leg.buyPrice1),
          ask: num(leg.sellPrice1),
        });
      }
      // Flat FUTSTK / OPTSTK rows
      const optType = String(row.optionType || "");
      if (optType === "CE" || optType === "PE") {
        const strike = num(String(row.strikePrice).trim());
        if (strike == null) continue;
        legs.push({
          strike,
          expiry: String(row.expiryDate || ""),
          type: optType,
          ltp: num(row.lastPrice) ?? 0,
          oi: num(row.openInterest),
          change_oi: num(row.changeinOpenInterest),
          volume: num(row.totalTradedVolume),
        });
      }
    }

    return {
      source: "nse_india",
      symbol: indexSym || bare,
      underlying,
      expiries,
      legs,
      latency_ms: Date.now() - t0,
      ok: legs.length > 0 || underlying > 0,
      error: legs.length ? undefined : "No option legs in NSE payload",
    };
  } catch (e) {
    return {
      source: "nse_india",
      symbol: bare,
      underlying: 0,
      expiries: [],
      legs: [],
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "NSE option chain failed",
    };
  }
}
