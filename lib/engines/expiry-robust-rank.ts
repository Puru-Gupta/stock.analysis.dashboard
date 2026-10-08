import {
  buildExpiryReturns,
  classifyOutliers,
  monthlyExpiryDates,
  weeklyExpiryDates,
} from "@/lib/engines/expiry-outliers";
import { mapPool, scanOptionStatsUniverse, type OptionStatsPick } from "@/lib/engines/options";
import { fetchYahooBars } from "@/lib/data/sync";
import { NIFTY_50 } from "@/lib/data/universes";
import type { OHLCVBar } from "@/lib/data/types";

const DEFAULT_START = "2021-01-01";
const DEFAULT_COVERAGE = 90;

export interface ExpiryCadenceSummary {
  total_expiries: number;
  strangle_survival_rate_pct: number;
  outlier_rate_pct: number;
  downside_outliers: number;
  upside_outliers: number;
  avg_mae_pct: number;
  avg_mfe_pct: number;
}

export interface ExpiryRobustPick {
  symbol: string;
  name: string;
  spot: number;
  robust_score: number;
  grade: "A" | "B" | "C" | "D";
  monthly: ExpiryCadenceSummary;
  weekly: ExpiryCadenceSummary;
  option_score: number;
  quant_score: number | null;
  seller_vol_score: number;
  confidence: number;
  z_score_1m: number;
  trend_label: string;
  regime: string;
  focus_status: "clean" | "caution" | "avoid";
  focus_label: string;
  live_iv: boolean;
  recommended_strategy: string;
  strategy_note: string;
  score_breakdown: string[];
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function summarizeCadence(
  bars: OHLCVBar[],
  cadence: "weekly" | "monthly",
  start: string,
  end: string,
  coverage: number,
): ExpiryCadenceSummary | null {
  const dates =
    cadence === "monthly"
      ? monthlyExpiryDates(bars, start, end)
      : weeklyExpiryDates(bars, start, end);
  const raw = buildExpiryReturns(bars, dates, "oc");
  if (raw.length < 12) return null;
  const { classified } = classifyOutliers(raw, coverage);
  const total = classified.length;
  const survived = classified.filter((r) => r.strangle_survived).length;
  const upside = classified.filter((r) => r.status === "upside_outlier").length;
  const downside = classified.filter((r) => r.status === "downside_outlier").length;
  const avgMfe = total ? r2(classified.reduce((a, r) => a + r.mfe_pct, 0) / total) : 0;
  const avgMae = total ? r2(classified.reduce((a, r) => a + r.mae_pct, 0) / total) : 0;
  return {
    total_expiries: total,
    strangle_survival_rate_pct: total ? r2((survived / total) * 100) : 0,
    outlier_rate_pct: total ? r2(((upside + downside) / total) * 100) : 0,
    downside_outliers: downside,
    upside_outliers: upside,
    avg_mae_pct: avgMae,
    avg_mfe_pct: avgMfe,
  };
}

function gradeFromScore(score: number): ExpiryRobustPick["grade"] {
  if (score >= 72) return "A";
  if (score >= 58) return "B";
  if (score >= 45) return "C";
  return "D";
}

function computeRobustScore(
  monthly: ExpiryCadenceSummary,
  weekly: ExpiryCadenceSummary,
  pick: OptionStatsPick,
): { score: number; breakdown: string[] } {
  const breakdown: string[] = [];
  let score = 0;

  const mSurv = monthly.strangle_survival_rate_pct;
  const wSurv = weekly.strangle_survival_rate_pct;
  score += mSurv * 0.28;
  score += wSurv * 0.14;
  breakdown.push(`Monthly ±1σ surv ${mSurv}%`);
  breakdown.push(`Weekly ±1σ surv ${wSurv}%`);

  const outlierPenalty = Math.max(0, monthly.outlier_rate_pct - 8) * 1.2;
  score += Math.max(0, 18 - outlierPenalty);
  breakdown.push(`Monthly outlier ${monthly.outlier_rate_pct}%`);

  score += (pick.option_score / 100) * 22;
  breakdown.push(`Option score ${pick.option_score}`);

  if (pick.quant_score != null) {
    score += (pick.quant_score / 100) * 14;
    breakdown.push(`Quant ${pick.quant_score}`);
  }

  score += (pick.confidence / 100) * 6;

  const z = Math.abs(pick.z_score_1m);
  if (z < 0.6) score += 8;
  else if (z < 1.2) score += 3;
  else score -= Math.min(12, z * 4);

  if (pick.trend_label === "Sideways") score += 5;
  if (pick.regime === "Very Quiet" || pick.regime === "Quiet") score += 4;

  if (pick.focus_status === "clean") score += 10;
  else if (pick.focus_status === "caution") score += 2;
  else score -= 28;

  if (pick.live_iv) score += 4;

  if (pick.recommended_strategy === "Short Strangle") score += 4;
  else if (pick.recommended_strategy === "Iron Condor") score += 2;
  else if (pick.recommended_strategy === "Wait") score -= 8;

  const tailRisk = Math.max(Math.abs(monthly.avg_mae_pct), monthly.avg_mfe_pct);
  if (tailRisk > 7) score -= 4;

  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, breakdown };
}

export interface ExpiryRobustScanResult {
  picks: ExpiryRobustPick[];
  start_date: string;
  end_date: string;
  coverage_pct: number;
  methodology: string;
  scanned_at: string;
}

/**
 * Rank Nifty 50 by blended expiry-window statistics (monthly + weekly) and live option scan scores.
 */
export async function scanExpiryRobustUniverse(
  endDate: string = new Date().toISOString().split("T")[0],
  startDate: string = DEFAULT_START,
  coveragePct: number = DEFAULT_COVERAGE,
  limit = 50,
): Promise<ExpiryRobustScanResult> {
  const statsPicks = await scanOptionStatsUniverse("call", 50);
  const statsBySym = new Map(statsPicks.map((p) => [p.symbol, p]));

  const symbols = NIFTY_50.slice(0, limit);

  const merged = await mapPool(symbols, 3, async (sym) => {
    const pick = statsBySym.get(sym);
    if (!pick) return null;
    try {
      const bars = await fetchYahooBars(sym, startDate, endDate);
      if (bars.length < 120) return null;
      const monthly = summarizeCadence(bars, "monthly", startDate, endDate, coveragePct);
      const weekly = summarizeCadence(bars, "weekly", startDate, endDate, coveragePct);
      if (!monthly || !weekly) return null;
      const { score, breakdown } = computeRobustScore(monthly, weekly, pick);
      return {
        symbol: sym,
        name: pick.name,
        spot: pick.spot,
        robust_score: score,
        grade: gradeFromScore(score),
        monthly,
        weekly,
        option_score: pick.option_score,
        quant_score: pick.quant_score ?? null,
        seller_vol_score: pick.seller_vol_score,
        confidence: pick.confidence,
        z_score_1m: pick.z_score_1m,
        trend_label: pick.trend_label,
        regime: pick.regime,
        focus_status: pick.focus_status,
        focus_label: pick.focus_label,
        live_iv: pick.live_iv ?? false,
        recommended_strategy: pick.recommended_strategy,
        strategy_note: pick.strategy_note,
        score_breakdown: breakdown,
      } satisfies ExpiryRobustPick;
    } catch {
      return null;
    }
  });

  const picks = merged.sort((a, b) => b.robust_score - a.robust_score);

  return {
    picks,
    start_date: startDate,
    end_date: endDate,
    coverage_pct: coveragePct,
    methodology:
      "Robust score blends monthly expiry ±1σ survival (28%), weekly survival (14%), monthly outlier rate, Stock Scan option/quant scores, distribution confidence, Z-score & trend, focus status, and strategy fit. For short-vol / range books; not investment advice.",
    scanned_at: new Date().toISOString(),
  };
}
