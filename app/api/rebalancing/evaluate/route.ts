import { NextRequest, NextResponse } from "next/server";
import { savePortfolioSnapshot, isPortfolioDbConfigured } from "@/lib/db/portfolio";
import {
  evaluateVirtualPortfolio,
  scanMonthlyRebalance,
  type AnalysisBias,
  type PortfolioHoldingInput,
  type RebalanceGoal,
  type RebalanceScanResult,
} from "@/lib/engines/rebalancing";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const holdings = (body.holdings || []) as PortfolioHoldingInput[];

  let scan = body.scan as RebalanceScanResult | undefined;
  if (!scan && body.rescan) {
    scan = await scanMonthlyRebalance({
      goal: (body.goal || "balanced") as RebalanceGoal,
      universe: body.universe || "nifty50",
      analysis_bias: (body.analysis_bias || "balanced") as AnalysisBias,
      lookback_months: Number(body.lookback_months || 12),
      monthly_capital: Number(body.monthly_capital || 100_000),
      custom_symbols: body.custom_symbols,
      limit: Number(body.limit || 10),
    });
  }

  const evaluation = await evaluateVirtualPortfolio(holdings, scan);

  if (body.client_id && isPortfolioDbConfigured() && holdings.length > 0) {
    await savePortfolioSnapshot({
      client_id: body.client_id,
      invested: evaluation.summary.invested,
      current_value: evaluation.summary.current_value,
      pnl: evaluation.summary.pnl,
      pnl_pct: evaluation.summary.pnl_pct,
      holdings_count: evaluation.summary.holdings_count,
      holdings_json: evaluation.holdings,
      benchmarks_json: evaluation.benchmarks,
      lookback_months: scan?.lookback_months ?? Number(body.lookback_months || 12),
      goal: scan?.goal ?? body.goal,
    });
  }

  return NextResponse.json({ ...evaluation, scan: scan ?? null });
}
