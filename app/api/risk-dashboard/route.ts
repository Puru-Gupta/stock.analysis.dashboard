import { NextResponse } from "next/server";
import { fetchLiveMarketBundle } from "@/lib/data/agents/orchestrator";
import { INDEX_SYMBOL } from "@/lib/data/universes";
import { scanUniverse } from "@/lib/engines/equity";
import { evaluateIndexRegime } from "@/lib/engines/regime";

export const maxDuration = 300;

export async function GET() {
  const [scans, niftyLive] = await Promise.all([
    scanUniverse({ universe: "nifty50", limit: 50 }),
    fetchLiveMarketBundle(INDEX_SYMBOL, { days: 365 }),
  ]);
  const regime = evaluateIndexRegime(niftyLive.bars);
  const buy = scans.filter((s) => s.signal === "Buy").length;
  const watch = scans.filter((s) => s.signal === "Watch").length;
  const avoid = scans.filter((s) => ["Avoid", "Sell"].includes(s.signal)).length;
  const highRisk = scans.filter((s) => s.risk_level === "High").length;
  const avg = scans.length ? Math.round(scans.reduce((s, x) => s + x.final_score, 0) / scans.length * 10) / 10 : 0;
  return NextResponse.json({
    market_summary: { stocks_analyzed: scans.length, buy_signals: buy, watch_signals: watch, avoid_signals: avoid, high_risk_count: highRisk, average_score: avg },
    top_opportunities: scans.slice(0, 5),
    index_regime: {
      state: regime.state,
      label: regime.label,
      detail: regime.detail,
      allows_long: regime.allows_long,
      ret_20d: regime.ret_20d,
    },
    disclaimer: "For personal research and educational use only. Not financial advice.",
  });
}

export async function POST() {
  return GET();
}
