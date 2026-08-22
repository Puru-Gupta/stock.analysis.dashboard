import { FNO_INDICES } from "@/lib/data/expiry-outliers-universe";
import { eventsForWindow } from "@/lib/data/market-events";
import { fetchYahooBars } from "@/lib/data/sync";
import type { OHLCVBar } from "@/lib/data/types";
import { normalizeSymbol } from "@/lib/data/universes";

export type ExpiryCadence = "weekly" | "monthly";
export type ReturnMode = "oc" | "hl";

/** First Tuesday weekly expiry after NSE shifted from Thursday (Sep 2024). */
export const TUESDAY_WEEKLY_EXPIRY_FROM = "2024-09-03";

export interface ExpiryWeekRow {
  start_date: string;
  end_date: string;
  return_pct: number;
  mfe_pct: number;
  mae_pct: number;
  sigma_move_pct: number;
  strangle_survived: boolean;
  events: { label: string; category: string }[];
  status: "within" | "upside_outlier" | "downside_outlier";
}

export interface ExpiryOutliersResult {
  symbol: string;
  label: string;
  universe: "index" | "stock";
  cadence: ExpiryCadence;
  return_mode: ReturnMode;
  expiry_day: "thursday" | "tuesday" | "mixed";
  start_date: string;
  end_date: string;
  coverage_pct: number;
  lower_percentile: number;
  upper_percentile: number;
  lower_boundary_pct: number;
  upper_boundary_pct: number;
  total_expiries: number;
  total_outliers: number;
  downside_outliers: number;
  upside_outliers: number;
  outlier_rate_pct: number;
  strangle_survival_rate_pct: number;
  avg_mfe_pct: number;
  avg_mae_pct: number;
  rows: ExpiryWeekRow[];
  note?: string;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, n: number) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

function alignToWeekday(iso: string, weekday: number) {
  const d = parseIso(iso);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return toIso(d);
}

function barIndexByDate(bars: OHLCVBar[], date: string) {
  return bars.findIndex((b) => b.date === date);
}

function nextBarAfter(bars: OHLCVBar[], date: string) {
  const i = barIndexByDate(bars, date);
  if (i < 0) {
    const after = bars.findIndex((b) => b.date > date);
    return after >= 0 ? after : -1;
  }
  return i + 1 < bars.length ? i + 1 : -1;
}

function weeklyByWeekday(
  bars: OHLCVBar[],
  start: string,
  end: string,
  weekday: number,
  from?: string,
  until?: string,
): string[] {
  const set = new Set(bars.map((b) => b.date));
  const out: string[] = [];
  let d = alignToWeekday(from && from > start ? from : start, weekday);
  const endMs = parseIso(end).getTime();
  while (parseIso(d).getTime() <= endMs) {
    if ((!until || d < until) && (!from || d >= from) && set.has(d)) out.push(d);
    d = addDays(d, 7);
  }
  return out;
}

/**
 * Weekly F&O expiries: Thursday before Sep 2024, Tuesday on/after (NSE index weekly shift).
 * Stocks follow the same convention for weekly series.
 */
export function weeklyExpiryDates(bars: OHLCVBar[], start: string, end: string): string[] {
  const thurs = weeklyByWeekday(bars, start, end, 4, start, TUESDAY_WEEKLY_EXPIRY_FROM);
  const tues = weeklyByWeekday(bars, start, end, 2, TUESDAY_WEEKLY_EXPIRY_FROM);
  return [...new Set([...thurs, ...tues])].sort();
}

/** Monthly F&O = last Thursday of calendar month (trading day). */
export function monthlyExpiryDates(bars: OHLCVBar[], start: string, end: string): string[] {
  const set = new Set(bars.map((b) => b.date));
  const out: string[] = [];
  const startD = parseIso(start);
  const endD = parseIso(end);
  let y = startD.getFullYear();
  let m = startD.getMonth();
  while (y < endD.getFullYear() || (y === endD.getFullYear() && m <= endD.getMonth())) {
    const last = new Date(y, m + 1, 0);
    while (last.getDay() !== 4) last.setDate(last.getDate() - 1);
    const iso = toIso(last);
    if (iso >= start && iso <= end && set.has(iso)) out.push(iso);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out.sort();
}

function realizedVolAnnualized(bars: OHLCVBar[], endIdx: number, lookback = 20): number {
  if (endIdx < lookback) return 0.18;
  const slice = bars.slice(endIdx - lookback, endIdx + 1);
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const cur = slice[i].close;
    if (prev > 0 && cur > 0) rets.push(Math.log(cur / prev));
  }
  if (rets.length < 5) return 0.18;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function sigmaMovePct(annualizedHv: number, tradingDays: number) {
  return r2(annualizedHv * Math.sqrt(tradingDays / 252) * 100);
}

function computeWindowMetrics(
  bars: OHLCVBar[],
  startIdx: number,
  endIdx: number,
  mode: ReturnMode,
): {
  return_pct: number;
  mfe_pct: number;
  mae_pct: number;
  sigma_move_pct: number;
  strangle_survived: boolean;
} | null {
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return null;
  const slice = bars.slice(startIdx, endIdx + 1);
  const open0 = slice[0].open;
  if (!open0 || open0 <= 0) return null;

  let mfe = -Infinity;
  let mae = Infinity;
  for (const b of slice) {
    mfe = Math.max(mfe, ((b.high - open0) / open0) * 100);
    mae = Math.min(mae, ((b.low - open0) / open0) * 100);
  }

  let return_pct: number;
  if (mode === "oc") {
    const closeN = slice[slice.length - 1].close;
    return_pct = r2(((closeN - open0) / open0) * 100);
  } else {
    const hi = Math.max(...slice.map((b) => b.high));
    const lo = Math.min(...slice.map((b) => b.low));
    return_pct = r2(((hi - lo) / open0) * 100);
  }

  const hv = realizedVolAnnualized(bars, startIdx);
  const sigma = sigmaMovePct(hv, slice.length);
  const strangle_survived = mfe <= sigma && mae >= -sigma;

  return {
    return_pct,
    mfe_pct: r2(mfe),
    mae_pct: r2(mae),
    sigma_move_pct: sigma,
    strangle_survived,
  };
}

export function buildExpiryReturns(
  bars: OHLCVBar[],
  expiryDates: string[],
  mode: ReturnMode,
): Omit<ExpiryWeekRow, "status">[] {
  const rows: Omit<ExpiryWeekRow, "status">[] = [];
  for (let i = 1; i < expiryDates.length; i++) {
    const prevExp = expiryDates[i - 1];
    const endExp = expiryDates[i];
    const startIdx = nextBarAfter(bars, prevExp);
    const endIdx = barIndexByDate(bars, endExp);
    if (startIdx < 0 || endIdx < 0) continue;
    const metrics = computeWindowMetrics(bars, startIdx, endIdx, mode);
    if (!metrics) continue;
    const startDate = bars[startIdx].date;
    const evts = eventsForWindow(startDate, endExp).map((e) => ({
      label: e.label,
      category: e.category,
    }));
    rows.push({
      start_date: startDate,
      end_date: endExp,
      ...metrics,
      events: evts,
    });
  }
  return rows;
}

export function classifyOutliers(
  rows: Omit<ExpiryWeekRow, "status">[],
  coveragePct: number,
): {
  lower_pct: number;
  upper_pct: number;
  lower_boundary: number;
  upper_boundary: number;
  classified: ExpiryWeekRow[];
} {
  const returns = rows.map((r) => r.return_pct).sort((a, b) => a - b);
  const tail = (100 - coveragePct) / 2;
  const lowerPct = tail;
  const upperPct = 100 - tail;
  const lower = r2(percentile(returns, lowerPct));
  const upper = r2(percentile(returns, upperPct));

  const classified: ExpiryWeekRow[] = rows.map((r) => {
    let status: ExpiryWeekRow["status"] = "within";
    if (r.return_pct > upper) status = "upside_outlier";
    else if (r.return_pct < lower) status = "downside_outlier";
    return { ...r, status };
  });

  return {
    lower_pct: lowerPct,
    upper_pct: upperPct,
    lower_boundary: lower,
    upper_boundary: upper,
    classified,
  };
}

function expiryDayMode(dates: string[]): ExpiryOutliersResult["expiry_day"] {
  if (!dates.length) return "thursday";
  const hasThu = dates.some((d) => parseIso(d).getDay() === 4);
  const hasTue = dates.some((d) => parseIso(d).getDay() === 2);
  if (hasThu && hasTue) return "mixed";
  if (hasTue) return "tuesday";
  return "thursday";
}

export async function analyzeExpiryOutliers(input: {
  symbol: string;
  label?: string;
  universe: "index" | "stock";
  cadence: ExpiryCadence;
  return_mode: ReturnMode;
  start_date: string;
  end_date: string;
  coverage_pct: number;
}): Promise<ExpiryOutliersResult> {
  const sym = normalizeSymbol(input.symbol);
  const bars = await fetchYahooBars(sym, input.start_date, input.end_date);
  if (bars.length < 60) {
    throw new Error(`Insufficient price history for ${sym} (${bars.length} bars)`);
  }

  const expiryDates =
    input.cadence === "monthly"
      ? monthlyExpiryDates(bars, input.start_date, input.end_date)
      : weeklyExpiryDates(bars, input.start_date, input.end_date);

  const raw = buildExpiryReturns(bars, expiryDates, input.return_mode);
  const { lower_pct, upper_pct, lower_boundary, upper_boundary, classified } = classifyOutliers(
    raw,
    input.coverage_pct,
  );

  const upside = classified.filter((r) => r.status === "upside_outlier").length;
  const downside = classified.filter((r) => r.status === "downside_outlier").length;
  const total = classified.length;
  const survived = classified.filter((r) => r.strangle_survived).length;
  const avgMfe = total ? r2(classified.reduce((a, r) => a + r.mfe_pct, 0) / total) : 0;
  const avgMae = total ? r2(classified.reduce((a, r) => a + r.mae_pct, 0) / total) : 0;

  const idxMeta = FNO_INDICES.find((x) => x.symbol === sym);
  const expDay = expiryDayMode(expiryDates);

  let note: string;
  if (input.cadence === "weekly") {
    note =
      expDay === "mixed"
        ? `Weekly windows: Thursday expiries before Sep 2024, Tuesday from ${TUESDAY_WEEKLY_EXPIRY_FROM}. MAE/MFE = max dip/rally from window open. ±1σ strangle uses 20d HV at window start.`
        : expDay === "tuesday"
          ? "Weekly Tuesday expiries (post Sep 2024 NSE convention). MAE/MFE = max dip/rally from window open."
          : "Weekly Thursday expiries. MAE/MFE = max dip/rally from window open.";
  } else {
    note =
      "Monthly windows: prior month expiry → current month expiry (last Thursday). MAE/MFE = max dip/rally from window open.";
  }

  return {
    symbol: sym,
    label: input.label || idxMeta?.label || sym.replace(".NS", "").replace("^", ""),
    universe: input.universe,
    cadence: input.cadence,
    return_mode: input.return_mode,
    expiry_day: expDay,
    start_date: input.start_date,
    end_date: input.end_date,
    coverage_pct: input.coverage_pct,
    lower_percentile: lower_pct,
    upper_percentile: upper_pct,
    lower_boundary_pct: lower_boundary,
    upper_boundary_pct: upper_boundary,
    total_expiries: total,
    total_outliers: upside + downside,
    downside_outliers: downside,
    upside_outliers: upside,
    outlier_rate_pct: total ? r2(((upside + downside) / total) * 100) : 0,
    strangle_survival_rate_pct: total ? r2((survived / total) * 100) : 0,
    avg_mfe_pct: avgMfe,
    avg_mae_pct: avgMae,
    rows: classified.sort((a, b) => Math.abs(b.return_pct) - Math.abs(a.return_pct)),
    note,
  };
}
