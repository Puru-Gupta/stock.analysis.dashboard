import { NextRequest, NextResponse } from "next/server";
import { analyzeFutures } from "@/lib/engines/futures";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const symbol = p.get("symbol");
  if (!symbol) return NextResponse.json({ detail: "symbol required" }, { status: 400 });
  const result = await analyzeFutures(
    symbol,
    p.get("timeframe") || "daily",
    p.get("strategy_mode") || "trend_following",
    p.get("risk_level") || "medium",
  );
  return NextResponse.json(result);
}
