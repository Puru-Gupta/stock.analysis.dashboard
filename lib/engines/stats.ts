/** Shared normal-distribution and descriptive statistics for option probability analysis. */

export function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function normPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

export function skewness(arr: number[]) {
  if (arr.length < 3) return 0;
  const m = mean(arr);
  const s = stdDev(arr) || 1;
  return arr.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0) / arr.length;
}

export function kurtosis(arr: number[]) {
  if (arr.length < 4) return 3;
  const m = mean(arr);
  const s = stdDev(arr) || 1;
  return arr.reduce((acc, x) => acc + ((x - m) / s) ** 4, 0) / arr.length;
}

export function empiricalPercentile(value: number, samples: number[]) {
  if (!samples.length) return 50;
  const below = samples.filter((s) => s <= value).length;
  return r1((below / samples.length) * 100);
}

export function zSignal(z: number): "Extreme" | "Elevated" | "Normal" | "Low" {
  const a = Math.abs(z);
  if (a >= 2) return "Extreme";
  if (a >= 1) return "Elevated";
  if (a >= 0.5) return "Normal";
  return "Low";
}

export function ratingColor(rating: string): "green" | "yellow" | "red" {
  if (["Excellent", "Strong", "Low", "Very Reliable", "High"].includes(rating)) return "green";
  if (["Good", "Medium", "Moderate", "Reliable", "Caution"].includes(rating)) return "yellow";
  return "red";
}

export function starsFromScore(score: number, max = 5) {
  const filled = Math.round(clamp01(score / 100) * max);
  return "★".repeat(filled) + "☆".repeat(max - filled);
}

export interface DistributionConfidence {
  score: number;
  label: string;
  warning: boolean;
  factors: {
    sample_size: number;
    shapiro_proxy: number;
    anderson_proxy: number;
    skewness: number;
    kurtosis: number;
    outlier_pct: number;
  };
}

/** Proxy normality confidence from skew, kurtosis, outliers, and CDF fit. */
export function distributionConfidence(returns: number[]): DistributionConfidence {
  const n = returns.length;
  if (n < 15) {
    return {
      score: 35,
      label: "Low Sample",
      warning: true,
      factors: { sample_size: n, shapiro_proxy: 0, anderson_proxy: 0, skewness: 0, kurtosis: 3, outlier_pct: 0 },
    };
  }

  const sk = skewness(returns);
  const ku = kurtosis(returns);
  const sig = stdDev(returns) || 1e-9;
  const mu = mean(returns);
  const jb = (n / 6) * (sk ** 2 + ((ku - 3) ** 2) / 4);
  const shapiroProxy = Math.max(0, Math.min(100, 100 - jb * 6));

  const outliers = returns.filter((r) => Math.abs((r - mu) / sig) > 3).length;
  const outlierPct = r1((outliers / n) * 100);

  const sorted = [...returns].sort((a, b) => a - b);
  let adSum = 0;
  for (let i = 0; i < n; i++) {
    const z = (sorted[i] - mu) / sig;
    adSum += Math.abs((i + 0.5) / n - normCdf(z));
  }
  const andersonProxy = Math.max(0, Math.min(100, 100 - adSum * 180));

  const sampleScore = Math.min(100, (n / 50) * 100);
  const outlierScore = Math.max(0, 100 - outlierPct * 12);
  const score = Math.round(
    0.2 * sampleScore + 0.25 * shapiroProxy + 0.25 * andersonProxy + 0.15 * outlierScore + 0.15 * (100 - Math.min(100, Math.abs(sk) * 40)),
  );

  const label = score >= 85 ? "Very Reliable" : score >= 70 ? "Reliable" : score >= 60 ? "Moderate" : "Unreliable";

  return {
    score,
    label,
    warning: score < 60,
    factors: {
      sample_size: n,
      shapiro_proxy: r1(shapiroProxy),
      anderson_proxy: r1(andersonProxy),
      skewness: r1(sk),
      kurtosis: r1(ku),
      outlier_pct: outlierPct,
    },
  };
}
