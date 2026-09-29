import type { OHLCVBar } from "@/lib/data/types";
import { getPriceHistory } from "@/lib/data/sync";
import { NIFTY_50 } from "@/lib/data/universes";

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R | null>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const r = await fn(items[idx]);
      if (r != null) out.push(r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

const TRAIN_RATIO = 0.7;
const HORIZONS = [
  { days: 2, label: "2 days" },
  { days: 5, label: "5 days" },
  { days: 7, label: "Weekly (~5 sessions)" },
  { days: 22, label: "Monthly (~22 sessions)" },
] as const;

type ModelId = "drift" | "ema_trend" | "mean_revert" | "linreg" | "hw_smooth";

const MODEL_LABELS: Record<ModelId, string> = {
  drift: "Drift (momentum)",
  ema_trend: "EMA trend",
  mean_revert: "Mean reversion",
  linreg: "Linear log-trend",
  hw_smooth: "Exp. smoothing",
};

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function dailyReturns(closes: number[]) {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

function ema(series: number[], span: number) {
  const k = 2 / (span + 1);
  let v = series[0];
  const out = [v];
  for (let i = 1; i < series.length; i++) {
    v = series[i] * k + v * (1 - k);
    out.push(v);
  }
  return out;
}

function predictOne(model: ModelId, closes: number[], horizon: number): number {
  const n = closes.length;
  const last = closes[n - 1];
  if (n < 25) return last;

  const rets = dailyReturns(closes);
  const meanRet = rets.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, rets.length);

  if (model === "drift") {
    return last * (1 + meanRet * horizon);
  }

  if (model === "ema_trend") {
    const e = ema(closes, 20);
    const slope = (e[n - 1] - e[Math.max(0, n - 6)]) / 5;
    return last + slope * horizon;
  }

  if (model === "mean_revert") {
    const ma = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const pull = (ma - last) * 0.15 * horizon;
    return last + pull + meanRet * last * horizon * 0.5;
  }

  if (model === "linreg") {
    const window = closes.slice(-60);
    const m = window.length;
    const xs = window.map((_, i) => i);
    const ys = window.map((c) => Math.log(c));
    const xMean = xs.reduce((a, b) => a + b, 0) / m;
    const yMean = ys.reduce((a, b) => a + b, 0) / m;
    let num = 0;
    let den = 0;
    for (let i = 0; i < m; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    const b = den ? num / den : 0;
    const a = yMean - b * xMean;
    return Math.exp(a + b * (m - 1 + horizon));
  }

  // hw_smooth
  const alpha = 0.25;
  let level = closes[n - 20];
  let trend = (closes[n - 1] - closes[n - 20]) / 20;
  for (let i = n - 19; i < n; i++) {
    const prev = level;
    level = alpha * closes[i] + (1 - alpha) * (level + trend);
    trend = 0.2 * (level - prev) + 0.8 * trend;
  }
  return level + trend * horizon;
}

function mape(actual: number, pred: number) {
  if (!actual) return 100;
  return Math.abs((actual - pred) / actual) * 100;
}

function evaluateModels(closes: number[], trainEnd: number): {
  metrics: Record<ModelId, { mape: number; dirAcc: number }>;
  weights: Record<ModelId, number>;
} {
  const models: ModelId[] = ["drift", "ema_trend", "mean_revert", "linreg", "hw_smooth"];
  const metrics = {} as Record<ModelId, { mape: number; dirAcc: number }>;

  for (const mid of models) {
    let mapeSum = 0;
    let dirHit = 0;
    let dirTotal = 0;
    let count = 0;

    for (let t = trainEnd; t < closes.length - 1; t++) {
      const hist = closes.slice(0, t + 1);
      const pred = predictOne(mid, hist, 1);
      const actual = closes[t + 1];
      mapeSum += mape(actual, pred);
      const predDir = pred - closes[t];
      const actDir = actual - closes[t];
      if (Math.abs(actDir / closes[t]) > 0.0005) {
        dirTotal++;
        if (predDir === 0 && actDir === 0) dirHit++;
        else if (predDir > 0 && actDir > 0) dirHit++;
        else if (predDir < 0 && actDir < 0) dirHit++;
      }
      count++;
    }

    metrics[mid] = {
      mape: count ? mapeSum / count : 50,
      dirAcc: dirTotal ? (dirHit / dirTotal) * 100 : 50,
    };
  }

  const inv = models.map((m) => 1 / Math.max(1, metrics[m].mape));
  const invSum = inv.reduce((a, b) => a + b, 0);
  const weights = {} as Record<ModelId, number>;
  models.forEach((m, i) => {
    weights[m] = invSum ? inv[i] / invSum : 0.2;
  });

  return { metrics, weights };
}

function ensemblePredict(closes: number[], horizon: number, weights: Record<ModelId, number>) {
  let sum = 0;
  for (const mid of Object.keys(weights) as ModelId[]) {
    sum += predictOne(mid, closes, horizon) * weights[mid];
  }
  return sum;
}

export type ForecastDirection = "up" | "down" | "stagnation";

/** ±0.35% move threshold — inside band = stagnation (sideways). */
export function directionFromChangePct(pct: number): ForecastDirection {
  if (pct > 0.35) return "up";
  if (pct < -0.35) return "down";
  return "stagnation";
}

export const ENSEMBLE_MODELS_USED = Object.values(MODEL_LABELS);

export interface ForecastHorizon {
  days: number;
  label: string;
  predicted_close: number;
  change_pct: number;
  direction: ForecastDirection;
  band_low: number;
  band_high: number;
}

export interface ModelBacktestRow {
  id: ModelId;
  name: string;
  holdout_mape_pct: number;
  direction_accuracy_pct: number;
  blend_weight_pct: number;
}

export interface PriceForecastResult {
  symbol: string;
  name: string;
  spot: number;
  train_bars: number;
  test_bars: number;
  alignment_score: number;
  holdout_mape_pct: number;
  direction_accuracy_pct: number;
  models: ModelBacktestRow[];
  horizons: ForecastHorizon[];
  history: { date: string; close: number }[];
  forecast_path: { date: string; close: number; band_low: number; band_high: number }[];
  method_note: string;
  models_used: string[];
  ensemble_method: string;
}

function addBusinessDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d.toISOString().split("T")[0];
}

export function forecastFromBars(symbol: string, bars: OHLCVBar[]): PriceForecastResult | null {
  if (bars.length < 80) return null;

  const closes = bars.map((b) => b.close);
  const trainEnd = Math.floor(closes.length * TRAIN_RATIO);
  const { metrics, weights } = evaluateModels(closes, trainEnd);

  const modelRows: ModelBacktestRow[] = (Object.keys(MODEL_LABELS) as ModelId[]).map((id) => ({
    id,
    name: MODEL_LABELS[id],
    holdout_mape_pct: r2(metrics[id].mape),
    direction_accuracy_pct: r2(metrics[id].dirAcc),
    blend_weight_pct: r2(weights[id] * 100),
  }));

  let ensMape = 0;
  let ensDirHit = 0;
  let ensDirTotal = 0;
  let ensCount = 0;
  for (let t = trainEnd; t < closes.length - 1; t++) {
    const hist = closes.slice(0, t + 1);
    const pred = ensemblePredict(hist, 1, weights);
    const actual = closes[t + 1];
    ensMape += mape(actual, pred);
    const predDir = pred - closes[t];
    const actDir = actual - closes[t];
    if (Math.abs(actDir / closes[t]) > 0.0005) {
      ensDirTotal++;
      if ((predDir > 0 && actDir > 0) || (predDir < 0 && actDir < 0)) ensDirHit++;
    }
    ensCount++;
  }

  const holdout_mape_pct = ensCount ? r2(ensMape / ensCount) : 50;
  const direction_accuracy_pct = ensDirTotal ? r2((ensDirHit / ensDirTotal) * 100) : 50;

  const mapeScore = Math.max(0, 100 - holdout_mape_pct * 2.5);
  const alignment_score = Math.round(Math.min(100, Math.max(0, mapeScore * 0.55 + direction_accuracy_pct * 0.45)));

  const rets = dailyReturns(closes);
  const vol = Math.sqrt(rets.slice(-40).reduce((s, r) => s + r * r, 0) / Math.min(40, rets.length));

  const spot = closes.at(-1)!;
  const lastDate = bars.at(-1)!.date;

  const horizons: ForecastHorizon[] = HORIZONS.map((h) => {
    const pred = ensemblePredict(closes, h.days, weights);
    const change_pct = r2(((pred - spot) / spot) * 100);
    const band = spot * vol * Math.sqrt(h.days);
    return {
      days: h.days,
      label: h.label,
      predicted_close: r2(pred),
      change_pct,
      direction: directionFromChangePct(change_pct),
      band_low: r2(pred - band),
      band_high: r2(pred + band),
    };
  });

  const maxDays = 22;
  const forecast_path: PriceForecastResult["forecast_path"] = [];
  let d = lastDate;
  for (let step = 1; step <= maxDays; step++) {
    d = addBusinessDays(d, 1);
    const pred = ensemblePredict(closes, step, weights);
    const band = spot * vol * Math.sqrt(step);
    forecast_path.push({
      date: d,
      close: r2(pred),
      band_low: r2(pred - band),
      band_high: r2(pred + band),
    });
  }

  const history = bars.slice(-120).map((b) => ({ date: b.date, close: r2(b.close) }));

  return {
    symbol,
    name: symbol.replace(".NS", ""),
    spot: r2(spot),
    train_bars: trainEnd,
    test_bars: closes.length - trainEnd,
    alignment_score,
    holdout_mape_pct,
    direction_accuracy_pct,
    models: modelRows.sort((a, b) => b.blend_weight_pct - a.blend_weight_pct),
    horizons,
    history,
    forecast_path,
    method_note:
      "5-model ensemble (drift, EMA, mean-reversion, log-linear, smoothing). 70% train / 30% holdout for MAPE & direction accuracy; weights = inverse MAPE. Direction: Up / Down / Stagnation (±0.35% band). Not Moirai/iTransformer — those need a GPU Python service.",
    models_used: ENSEMBLE_MODELS_USED,
    ensemble_method: "Weighted ensemble (inverse holdout MAPE)",
  };
}

export async function forecastSymbol(symbol: string): Promise<PriceForecastResult | null> {
  const { bars } = await getPriceHistory(symbol, 400);
  return forecastFromBars(symbol, bars);
}

export interface ForecastScanPick {
  symbol: string;
  name: string;
  spot: number;
  alignment_score: number;
  holdout_mape_pct: number;
  direction_accuracy_pct: number;
  forecast_2d_pct: number;
  forecast_5d_pct: number;
  forecast_weekly_pct: number;
  forecast_monthly_pct: number;
  direction_2d: ForecastDirection;
  direction_5d: ForecastDirection;
  direction_weekly: ForecastDirection;
  direction_monthly: ForecastDirection;
  primary_direction: ForecastDirection;
}

export async function scanNifty50ForecastAlignment(limit = 50): Promise<ForecastScanPick[]> {
  const results = await mapPool(NIFTY_50, 4, async (sym) => {
    try {
      const f = await forecastSymbol(sym);
      if (!f) return null;
      const h2 = f.horizons.find((h) => h.days === 2);
      const h5 = f.horizons.find((h) => h.days === 5);
      const hw = f.horizons.find((h) => h.days === 7);
      const hm = f.horizons.find((h) => h.days === 22);
      return {
        symbol: sym,
        name: f.name,
        spot: f.spot,
        alignment_score: f.alignment_score,
        holdout_mape_pct: f.holdout_mape_pct,
        direction_accuracy_pct: f.direction_accuracy_pct,
        forecast_2d_pct: h2?.change_pct ?? 0,
        forecast_5d_pct: h5?.change_pct ?? 0,
        forecast_weekly_pct: hw?.change_pct ?? 0,
        forecast_monthly_pct: hm?.change_pct ?? 0,
        direction_2d: h2?.direction ?? "stagnation",
        direction_5d: h5?.direction ?? "stagnation",
        direction_weekly: hw?.direction ?? "stagnation",
        direction_monthly: hm?.direction ?? "stagnation",
        primary_direction: h5?.direction ?? "stagnation",
      };
    } catch {
      return null;
    }
  });

  return results
    .sort((a, b) => b.alignment_score - a.alignment_score)
    .slice(0, limit);
}
