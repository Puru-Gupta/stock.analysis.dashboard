import { NextRequest, NextResponse } from "next/server";
import { scanMonthlyRebalance, type AnalysisBias, type RebalanceGoal } from "@/lib/engines/rebalancing";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const goal = (p.get("goal") || "balanced") as RebalanceGoal;
  const universe = p.get("universe") || "nifty50";
  const analysis_bias = (p.get("analysis_bias") || "balanced") as AnalysisBias;
  const lookback_months = Number(p.get("lookback_months") || 12);
  const monthly_capital = Number(p.get("monthly_capital") || 100_000);
  const custom = p.get("custom_symbols");
  const custom_symbols = custom ? custom.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const limit = Number(p.get("limit") || 10);

  const results = await scanMonthlyRebalance({
    goal,
    universe,
    analysis_bias,
    lookback_months,
    monthly_capital,
    custom_symbols,
    limit,
  });
  return NextResponse.json(results);
}
