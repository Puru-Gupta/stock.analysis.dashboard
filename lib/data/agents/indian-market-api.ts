/** Free community Indian market API — https://github.com/0xramm/Indian-Stock-Market-API */

import type { AgentQuote } from "./types";

const BASE = process.env.INDIAN_MARKET_API_URL || "http://65.0.104.9";

function stripNs(symbol: string): string {
  return symbol.replace(/\.NS$/i, "").toUpperCase();
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const cleaned = v.replace(/[₹,%crs\s]/gi, "").replace(/,/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function indianMarketApiQuoteAgent(symbol: string): Promise<AgentQuote> {
  const bare = stripNs(symbol);
  const t0 = Date.now();
  try {
    const url = `${BASE}/stock?symbol=${encodeURIComponent(bare)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "moneydashboard/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        source: "indian_market_api",
        symbol: bare,
        last: 0,
        fetched_at: new Date().toISOString(),
        latency_ms: Date.now() - t0,
        ok: false,
        error: `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    const data = json?.data || json;
    const last =
      num(data?.price) ||
      num(data?.last_price) ||
      num(data?.lastPrice) ||
      num(data?.current_price) ||
      0;

    return {
      source: "indian_market_api",
      symbol: bare,
      last,
      change: num(data?.change),
      change_pct: num(data?.change_percent) || num(data?.pChange),
      name: data?.name || data?.company_name || bare,
      sector: data?.sector,
      pe: num(data?.pe) || num(data?.pe_ratio),
      fetched_at: new Date().toISOString(),
      latency_ms: Date.now() - t0,
      ok: last > 0,
      error: last > 0 ? undefined : "Empty price from Indian Market API",
    };
  } catch (e) {
    return {
      source: "indian_market_api",
      symbol: bare,
      last: 0,
      fetched_at: new Date().toISOString(),
      latency_ms: Date.now() - t0,
      ok: false,
      error: e instanceof Error ? e.message : "Indian Market API failed",
    };
  }
}
