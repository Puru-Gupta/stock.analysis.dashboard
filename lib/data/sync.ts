import { getSupabase } from "@/lib/db/supabase";
import { fetchYahooBarsHttp, fetchYahooFundamentalsHttp } from "./yahoo-http";
import { fetchFundamentalsViaPython, fetchHistoryViaPython } from "./yahoo-python";
import { fetchYFinanceBars, fetchYFinanceFundamentals } from "./yfinance";
import type { FundamentalsData, OHLCVBar, SyncResult } from "./types";

const INITIAL_HISTORY_DAYS = 365;

function hasFundamentalData(fund: FundamentalsData): boolean {
  return !!(
    fund.market_cap ??
    fund.pe_ratio ??
    fund.roe ??
    fund.revenue_growth ??
    fund.sector ??
    fund.debt_to_equity
  );
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function daysBetween(start: string, end?: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end || formatDate(new Date())).getTime();
  return Math.max(30, Math.ceil((endMs - startMs) / 86400000) + 5);
}

export async function fetchYahooBars(symbol: string, start: string, end?: string): Promise<OHLCVBar[]> {
  // Primary: yahoo-finance2 (Node yfinance) — reliable on Vercel
  try {
    const days = daysBetween(start, end);
    const yfBars = await fetchYFinanceBars(symbol, days);
    if (yfBars.length) {
      const endDate = end || formatDate(new Date());
      return yfBars.filter((bar) => bar.date >= start && bar.date <= endDate);
    }
  } catch {
    /* fall through */
  }

  try {
    const direct = await fetchYahooBarsHttp(symbol, start, end);
    if (direct.length) return direct;
  } catch {
    /* fall through to Python */
  }

  const days = daysBetween(start, end);
  const pythonBars = await fetchHistoryViaPython(symbol, days);
  if (!pythonBars.length) return [];

  const endDate = end || formatDate(new Date());
  return pythonBars.filter((bar) => bar.date >= start && bar.date <= endDate);
}

async function getLatestBarDate(symbol: string): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("price_bars")
    .select("bar_date")
    .eq("symbol", symbol)
    .order("bar_date", { ascending: false })
    .limit(1)
    .single();
  return data?.bar_date || null;
}

async function upsertBars(symbol: string, bars: OHLCVBar[]): Promise<number> {
  if (!bars.length) return 0;
  const db = getSupabase();
  if (!db) return 0;
  const rows = bars.map((b) => ({
    symbol,
    bar_date: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
  const { error } = await db.from("price_bars").upsert(rows, { onConflict: "symbol,bar_date" });
  if (error) throw new Error(error.message);
  return bars.length;
}

async function logSync(symbol: string, lastDate: string | null, added: number, type: string) {
  const db = getSupabase();
  if (!db) return;
  await db.from("sync_log").insert({
    symbol,
    last_bar_date: lastDate,
    bars_added: added,
    sync_type: type,
  });
}

/** Incremental sync: only fetch bars newer than the last stored date. */
export async function syncPriceHistory(symbol: string): Promise<SyncResult> {
  const latest = await getLatestBarDate(symbol);
  let newBars: OHLCVBar[] = [];
  let syncType: SyncResult["syncType"] = "cached";

  if (!latest) {
    newBars = await fetchYahooBars(symbol, daysAgo(INITIAL_HISTORY_DAYS));
    syncType = "full";
  } else {
    const today = formatDate(new Date());
    if (latest < today) {
      newBars = await fetchYahooBars(symbol, addDays(latest, 1), today);
      syncType = "incremental";
    }
  }

  if (newBars.length) {
    await upsertBars(symbol, newBars);
    await logSync(symbol, newBars[newBars.length - 1].date, newBars.length, syncType);
  }

  const db = getSupabase();
  let totalBars = newBars.length;
  if (db) {
    const { count } = await db.from("price_bars").select("*", { count: "exact", head: true }).eq("symbol", symbol);
    totalBars = count || newBars.length;
  }

  return {
    symbol,
    barsAdded: newBars.length,
    totalBars,
    lastBarDate: newBars.length ? newBars[newBars.length - 1].date : latest,
    syncType: newBars.length ? syncType : "cached",
  };
}

/** Get price history — syncs incrementally first, then returns from DB. */
export async function getPriceHistory(symbol: string, days = 365): Promise<{ bars: OHLCVBar[]; sync: SyncResult }> {
  const sync = await syncPriceHistory(symbol);
  const db = getSupabase();
  if (db) {
    const cutoff = daysAgo(days);
    const { data } = await db
      .from("price_bars")
      .select("bar_date, open, high, low, close, volume")
      .eq("symbol", symbol)
      .gte("bar_date", cutoff)
      .order("bar_date", { ascending: true });
    if (data?.length) {
      const bars = data.map((r) => ({
        date: r.bar_date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      }));
      return { bars, sync };
    }
  }
  const bars = await fetchYahooBars(symbol, daysAgo(days));
  return {
    bars,
    sync: { symbol, barsAdded: bars.length, totalBars: bars.length, lastBarDate: bars.at(-1)?.date || null, syncType: "full" },
  };
}

export function resampleBars(bars: OHLCVBar[], timeframe: string): OHLCVBar[] {
  if (timeframe === "daily" || bars.length === 0) return bars;
  const buckets = new Map<string, OHLCVBar[]>();
  for (const bar of bars) {
    const d = new Date(bar.date);
    let key: string;
    if (timeframe === "weekly") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      key = formatDate(new Date(d.getFullYear(), d.getMonth(), diff));
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(bar);
  }
  return Array.from(buckets.entries()).map(([, group]) => ({
    date: group[group.length - 1].date,
    open: group[0].open,
    high: Math.max(...group.map((g) => g.high)),
    low: Math.min(...group.map((g) => g.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((s, g) => s + g.volume, 0),
  }));
}

const FUNDAMENTALS_TTL_HOURS = 24;

export async function getFundamentals(symbol: string): Promise<FundamentalsData> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("fundamentals_cache").select("data, updated_at").eq("symbol", symbol).single();
    if (data) {
      const cached = data.data as FundamentalsData;
      const age = (Date.now() - new Date(data.updated_at).getTime()) / 3600000;
      if (age < FUNDAMENTALS_TTL_HOURS && hasFundamentalData(cached)) return cached;
    }
  }

  let fund: FundamentalsData = { symbol };
  try {
    fund = await fetchYFinanceFundamentals(symbol);
  } catch { /* keep defaults */ }

  if (!hasFundamentalData(fund)) {
    try {
      fund = await fetchYahooFundamentalsHttp(symbol);
    } catch { /* keep defaults */ }
  }

  if (!hasFundamentalData(fund)) {
    const pythonFund = await fetchFundamentalsViaPython(symbol);
    if (pythonFund && hasFundamentalData(pythonFund)) fund = pythonFund;
  }

  if (db && hasFundamentalData(fund)) {
    await db.from("fundamentals_cache").upsert({ symbol, data: fund, updated_at: new Date().toISOString() });
  }
  return fund;
}
