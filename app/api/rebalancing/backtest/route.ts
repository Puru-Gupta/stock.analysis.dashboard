import { NextRequest, NextResponse } from "next/server";
import { runRebalanceBacktest } from "@/lib/engines/backtest";
import type { AnalysisBias, RebalanceGoal } from "@/lib/engines/rebalancing";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const result = await runRebalanceBacktest({
      universe: p.get("universe") || "nifty50",
      lookback_months: Number(p.get("lookback_months") || 12),
      monthly_capital: Number(p.get("monthly_capital") || 100_000),
      goal: (p.get("goal") || "balanced") as RebalanceGoal,
      analysis_bias: (p.get("analysis_bias") || "balanced") as AnalysisBias,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backtest failed" },
      { status: 500 },
    );
  }
}
