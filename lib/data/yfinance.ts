/**
 * Primary market data via yahoo-finance2 — the Node equivalent of Python yfinance.
 * Works on Vercel (no Python required).
 */

import YahooFinance from "yahoo-finance2";
import type { FundamentalsData, OHLCVBar } from "./types";

const yf = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function fetchYFinanceBars(symbol: string, days = 365): Promise<OHLCVBar[]> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - days);
  try {
    const result = await yf.chart(symbol, {
      period1,
      interval: "1d",
    });
    const quotes = result?.quotes || [];
    const bars: OHLCVBar[] = [];
    for (const q of quotes) {
      if (q.open == null || q.close == null || !q.date) continue;
      bars.push({
        date: formatDate(new Date(q.date)),
        open: Number(q.open),
        high: Number(q.high ?? q.close),
        low: Number(q.low ?? q.close),
        close: Number(q.close),
        volume: Number(q.volume ?? 0),
      });
    }
    return bars;
  } catch {
    // Fallback: historical() API
    try {
      const rows = await yf.historical(symbol, {
        period1,
        period2: new Date(),
        interval: "1d",
      });
      return (rows || [])
        .filter((r) => r.open != null && r.close != null)
        .map((r) => ({
          date: formatDate(new Date(r.date)),
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume ?? 0),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }
}

export async function fetchYFinanceQuote(symbol: string): Promise<{
  last: number;
  name?: string;
  change?: number;
  change_pct?: number;
} | null> {
  try {
    const q = await yf.quote(symbol);
    const last = Number(q.regularMarketPrice ?? q.postMarketPrice ?? 0);
    if (!last) return null;
    return {
      last,
      name: q.shortName || q.longName || undefined,
      change: q.regularMarketChange != null ? Number(q.regularMarketChange) : undefined,
      change_pct: q.regularMarketChangePercent != null ? Number(q.regularMarketChangePercent) : undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchYFinanceFundamentals(symbol: string): Promise<FundamentalsData> {
  const fund: FundamentalsData = { symbol };
  try {
    const q = await yf.quoteSummary(symbol, {
      modules: [
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "assetProfile",
        "price",
      ],
    });
    const sd = (q.summaryDetail || {}) as Record<string, unknown>;
    const ks = (q.defaultKeyStatistics || {}) as Record<string, unknown>;
    const fin = (q.financialData || {}) as Record<string, unknown>;
    const profile = (q.assetProfile || {}) as Record<string, unknown>;
    const price = (q.price || {}) as Record<string, unknown>;

    fund.name =
      String(price.longName || price.shortName || "").trim() ||
      symbol.replace(".NS", "");
    fund.sector = profile.sector != null ? String(profile.sector) : undefined;
    fund.industry = profile.industry != null ? String(profile.industry) : undefined;
    fund.market_cap = num(sd.marketCap ?? price.marketCap);
    fund.pe_ratio = num(sd.trailingPE);
    fund.forward_pe = num(sd.forwardPE);
    fund.pb_ratio = num(sd.priceToBook ?? ks.priceToBook);
    fund.dividend_yield = num(sd.dividendYield);
    fund.eps = num(ks.trailingEps);
    fund.revenue_growth = num(fin.revenueGrowth);
    fund.earnings_growth = num(fin.earningsGrowth);
    fund.profit_margin = num(fin.profitMargins);
    fund.operating_margin = num(fin.operatingMargins);
    fund.roe = num(fin.returnOnEquity);
    fund.debt_to_equity = num(fin.debtToEquity);
    fund.free_cash_flow = num(fin.freeCashflow);
  } catch {
    /* keep sparse */
  }
  return fund;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
