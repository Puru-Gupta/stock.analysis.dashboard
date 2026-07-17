import { NextRequest, NextResponse } from "next/server";
import { scanUniverse } from "@/lib/engines/equity";
import type { ValuationFilter } from "@/lib/engines/valuation-brackets";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const valuationRaw = (p.get("valuation") || "") as ValuationFilter;
  const valuation: ValuationFilter =
    valuationRaw === "cheap" ||
    valuationRaw === "fair" ||
    valuationRaw === "premium" ||
    valuationRaw === "soft"
      ? valuationRaw
      : "";

  const results = await scanUniverse({
    universe: p.get("universe") || "nifty50",
    sector: p.get("sector") || undefined,
    timeframe: p.get("timeframe") || "daily",
    recommendation: p.get("recommendation") || undefined,
    risk_level: p.get("risk_level") || undefined,
    setup: p.get("setup") || undefined,
    valuation,
    limit: Number(p.get("limit") || 30),
  });
  return NextResponse.json(results);
}
